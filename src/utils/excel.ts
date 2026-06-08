import * as XLSX from "xlsx";
import type {
  ColumnMapping,
  CourseRecord,
  RawRow,
  RequiredColumn,
  SheetData,
  StudentInput,
  StudentResult,
} from "../types";
import { normalizeName, normalizeStudentId, parseNumber } from "./calculations";
import { formatNumber, formatPercent, todayCompact } from "./format";

export const REQUIRED_COLUMN_LABELS: Record<RequiredColumn, string> = {
  studentId: "학번",
  name: "이름/성명",
  subject: "과목명",
  category: "교과군/교과구분",
  credit: "학점/단위수",
  achievement: "성취도",
  rankGrade: "석차등급",
  rankPercentile: "석차비율",
};

export const REQUIRED_FOR_CALCULATION: RequiredColumn[] = [
  "studentId",
  "name",
  "subject",
  "credit",
  "achievement",
];

const DETECTION_KEYWORDS: Record<RequiredColumn, string[]> = {
  studentId: ["학번", "학생번호", "번호", "반번호", "개인번호"],
  name: ["성명", "이름", "학생명", "성 명"],
  subject: ["과목명", "과목", "교과목", "교과목명"],
  category: ["교과군", "교과구분", "교과", "과목구분", "편제", "영역", "계열"],
  credit: ["학점", "단위수", "이수단위", "단위", "이수학점"],
  achievement: ["성취도", "성취평가", "성취등급", "성취도별", "성취"],
  rankGrade: ["석차등급", "등급", "평균석차등급", "석차 등급"],
  rankPercentile: ["석차비율", "석차백분율", "백분율", "석차 비율", "석차 백분율"],
};

export async function readWorkbook(file: File): Promise<SheetData[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    return matrixToSheetData(name, matrix);
  }).filter((sheet) => sheet.headers.length > 0);
}

export function remapSheetWithHeaderRow(sheet: SheetData, headerRowNumber: number): SheetData {
  const fallbackIndex = sheet.headerRowIndex;
  const requestedIndex = Number.isFinite(headerRowNumber) ? Math.floor(headerRowNumber) - 1 : fallbackIndex;
  const headerRowIndex = Math.min(Math.max(requestedIndex, 0), Math.max(sheet.matrix.length - 1, 0));
  return matrixToSheetData(sheet.name, sheet.matrix, headerRowIndex);
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  const usedHeaders = new Set<string>();

  (Object.keys(DETECTION_KEYWORDS) as RequiredColumn[]).forEach((key) => {
    const keywords = DETECTION_KEYWORDS[key].map(normalizeHeader);
    let bestHeader = "";
    let bestScore = 0;

    headers.forEach((header) => {
      if (usedHeaders.has(header)) return;

      const normalized = normalizeHeader(header);
      const exactMatch = keywords.some((keyword) => normalized === keyword);
      const includesMatch = keywords.some(
        (keyword) => normalized.includes(keyword) || keyword.includes(normalized),
      );
      const score = exactMatch ? 3 : includesMatch ? 2 : fuzzyScore(normalized, keywords);

      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    });

    if (bestScore > 0) {
      mapping[key] = bestHeader;
      usedHeaders.add(bestHeader);
    }
  });

  return mapping;
}

export function parseStudentInputs(text: string): StudentInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\s+/);
      const first = parts[0] ?? "";
      const looksLikeId = /\d/.test(first);

      if (parts.length >= 2 && looksLikeId) {
        return {
          order: index + 1,
          original: line,
          studentId: first,
          name: parts.slice(1).join(""),
        };
      }

      if (looksLikeId) {
        return {
          order: index + 1,
          original: line,
          studentId: first,
        };
      }

      return {
        order: index + 1,
        original: line,
        name: parts.join(""),
      };
    });
}

export function buildCourseRecords(rows: RawRow[], mapping: ColumnMapping): CourseRecord[] {
  return rows
    .map((row) => {
      const creditValue = parseNumber(readMapped(row, mapping.credit));
      return {
        studentId: normalizeStudentId(readMapped(row, mapping.studentId)),
        name: String(readMapped(row, mapping.name) ?? "").trim(),
        subject: String(readMapped(row, mapping.subject) ?? "").trim(),
        category: String(readMapped(row, mapping.category) ?? "").trim(),
        credit: creditValue && creditValue > 0 ? creditValue : 1,
        achievement: String(readMapped(row, mapping.achievement) ?? "").trim(),
        rankGrade: readMapped(row, mapping.rankGrade),
        rankPercentile: readMapped(row, mapping.rankPercentile),
        raw: row,
      };
    })
    .filter((record) => record.studentId || record.name || record.subject);
}

export function findRecordsForStudent(input: StudentInput, records: CourseRecord[]) {
  const inputId = normalizeStudentId(input.studentId);
  const inputName = normalizeName(input.name);

  if (inputId && inputName) {
    const exact = records.filter(
      (record) =>
        normalizeStudentId(record.studentId) === inputId && normalizeName(record.name) === inputName,
    );
    if (exact.length > 0) return resolveSingleStudent(exact, "정상");

    const idMatches = records.filter((record) => normalizeStudentId(record.studentId) === inputId);
    if (idMatches.length > 0) return resolveSingleStudent(idMatches, "이름 불일치 확인 필요");

    return { records: [], status: "자료 없음" as const };
  }

  if (inputId) {
    const idMatches = records.filter((record) => normalizeStudentId(record.studentId) === inputId);
    return resolveSingleStudent(idMatches, "정상");
  }

  if (inputName) {
    const nameMatches = records.filter((record) => normalizeName(record.name) === inputName);
    return resolveSingleStudent(nameMatches, "정상");
  }

  return { records: [], status: "자료 없음" as const };
}

export function getMissingRequiredColumns(mapping: ColumnMapping) {
  const missing = REQUIRED_FOR_CALCULATION.filter((key) => !mapping[key]).map(
    (key) => REQUIRED_COLUMN_LABELS[key],
  );
  if (!mapping.rankGrade && !mapping.rankPercentile) {
    missing.push("석차등급 또는 석차비율");
  }
  return missing;
}

export function exportResultsToExcel(results: StudentResult[]) {
  const workbook = XLSX.utils.book_new();
  const summaryRows = results.map((result) => ({
    순번: result.order,
    학번: result.studentId,
    이름: result.name,
    "① 전문교과 평균 B 이상 여부": result.condition1Status,
    "전문교과 총 과목 수": result.professionalStats.totalProfessionalSubjects,
    "전문교과 환산점수 합계": result.professionalStats.professionalScoreSum ?? "",
    "전문교과 평균 산출값": formatNumber(result.professionalStats.professionalAverageValue),
    "② 전문교과 A 비율 50% 이상 여부": result.condition2Status,
    "전문교과 A 과목 수": result.professionalStats.professionalACount,
    "전문교과 A 비율(%)": formatPercent(result.professionalStats.professionalARate),
    "③ 보통교과 기준 충족 여부": result.condition3Status,
    "보통교과 평균 석차비율": formatNumber(result.generalStats.generalAveragePercentile),
    "보통교과 평균 석차등급": formatNumber(result.generalStats.generalAverageRankGrade),
    "최종 충족 여부": result.finalStatus,
    비고: result.notes.join(", "),
  }));

  const detailRows = results.flatMap((result) => [
    ...result.professionalStats.details.map((detail) => ({
      순번: result.order,
      학번: result.studentId,
      이름: result.name,
      구분: "전문교과",
      과목명: detail.subject,
      교과구분: detail.category,
      학점: detail.credit,
      성취도: detail.achievement,
      환산점수: detail.score ?? "",
      "A 여부": detail.isA ? "예" : "아니오",
      석차등급: "",
      석차비율: "",
      "계산 포함 여부": detail.score === null ? "제외" : "포함",
      "제외 사유": detail.score === null ? "성취도 미산출" : "",
    })),
    ...result.generalStats.details.map((detail) => ({
      순번: result.order,
      학번: result.studentId,
      이름: result.name,
      구분: "보통교과",
      과목명: detail.subject,
      교과구분: detail.category,
      학점: detail.credit,
      성취도: "",
      환산점수: "",
      "A 여부": "",
      석차등급: detail.rankGrade ?? "",
      석차비율: detail.rankPercentile ?? "",
      "계산 포함 여부":
        detail.includeRankGrade || detail.includePercentile ? "일부/전체 포함" : "제외",
      "제외 사유": detail.exclusionReason,
    })),
  ]);

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "판정결과");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "상세산출내역");
  XLSX.writeFile(workbook, `보건직_학과성적_충족여부_${todayCompact()}.xlsx`);
}

function matrixToSheetData(name: string, matrix: unknown[][], forcedHeaderRowIndex?: number): SheetData {
  const headerRowIndex = forcedHeaderRowIndex ?? findHeaderRow(matrix);
  const headerValues = matrix[headerRowIndex] ?? [];
  const headers = makeUniqueHeaders(headerValues.map((value) => String(value ?? "").trim()));
  const rows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) => {
      const rowObject: RawRow = {};
      headers.forEach((header, index) => {
        rowObject[header] = row[index] ?? "";
      });
      return rowObject;
    });

  return {
    name,
    headerRowIndex,
    headers,
    rows,
    matrix,
  };
}

function findHeaderRow(matrix: unknown[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  matrix.slice(0, 20).forEach((row, index) => {
    const values = row.map((value) => String(value ?? "").trim()).filter(Boolean);
    const score = values.reduce((sum, value) => {
      const normalized = normalizeHeader(value);
      const matched = Object.values(DETECTION_KEYWORDS).some((keywords) =>
        keywords.map(normalizeHeader).some((keyword) => normalized.includes(keyword)),
      );
      return sum + (matched ? 2 : 0) + (value ? 0.1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function emptyMapping(): ColumnMapping {
  return {
    studentId: "",
    name: "",
    subject: "",
    category: "",
    credit: "",
    achievement: "",
    rankGrade: "",
    rankPercentile: "",
  };
}

function normalizeHeader(value: string) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[()[\]{}._-]/g, "")
    .toLowerCase();
}

function fuzzyScore(header: string, keywords: string[]) {
  if (!header) return 0;
  return keywords.some((keyword) => keyword.length >= 2 && header.includes(keyword.slice(0, 2)))
    ? 1
    : 0;
}

function makeUniqueHeaders(headers: string[]) {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const fallback = header || `빈열${index + 1}`;
    const count = counts.get(fallback) ?? 0;
    counts.set(fallback, count + 1);
    return count === 0 ? fallback : `${fallback}_${count + 1}`;
  });
}

function readMapped(row: RawRow, header: string) {
  if (!header) return "";
  return row[header] ?? "";
}

function resolveSingleStudent(
  records: CourseRecord[],
  status: "정상" | "이름 불일치 확인 필요",
) {
  if (records.length === 0) return { records: [], status: "자료 없음" as const };

  const uniqueStudents = new Set(
    records.map((record) => `${normalizeStudentId(record.studentId)}|${normalizeName(record.name)}`),
  );
  if (uniqueStudents.size > 1) return { records, status: "동명이인 확인 필요" as const };
  return { records, status };
}
