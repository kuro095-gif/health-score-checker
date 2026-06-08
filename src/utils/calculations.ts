import type {
  CourseRecord,
  GeneralStats,
  JudgeStatus,
  ProfessionalStats,
  StudentResult,
} from "../types";

const PROFESSIONAL_KEYWORDS = [
  "보건·복지",
  "보건복지",
  "경영·금융",
  "경영금융",
  "상업·정보",
  "상업정보",
  "전문교과",
  "전문교과Ⅱ",
  "전문교과II",
  "전문교과2",
  "직업계열",
  "직업",
  "특성화",
  "실무",
];

const GENERAL_KEYWORDS = [
  "국어",
  "수학",
  "영어",
  "한국사",
  "사회",
  "과학",
  "체육",
  "예술",
  "음악",
  "미술",
  "생활·교양",
  "생활교양",
  "교양",
  "보통교과",
  "공통",
  "일반",
];

export function normalizeGrade(value: unknown): "A" | "B" | "C" | "D" | "E" | null {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!text) return null;
  if (["-", "P", "PASS", "이수", "미이수", "미산출", "해당없음", "없음", "N/A"].includes(text)) {
    return null;
  }

  const firstLetter = text.match(/[ABCDE]/)?.[0];
  return firstLetter ? (firstLetter as "A" | "B" | "C" | "D" | "E") : null;
}

export function achievementToScore(grade: "A" | "B" | "C" | "D" | "E" | null) {
  if (grade === "A") return 1;
  if (grade === "B") return 0;
  if (grade === "C") return -1;
  if (grade === "D") return -2;
  if (grade === "E") return -3;
  return null;
}

export function isValidRankGrade(value: unknown) {
  const numeric = parseNumber(value);
  return numeric !== null && numeric > 0;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0 ? value : null;

  const text = String(value).trim();
  if (!text) return null;
  const upperText = text.toUpperCase();
  if (
    ["-", "0", "미산출", "P", "PASS", "이수", "미이수", "해당없음", "없음", "N/A"].includes(
      upperText,
    )
  ) {
    return null;
  }

  const normalized = text.replace(/,/g, "").replace(/%/g, "").replace(/\s/g, "");
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric !== 0) return numeric;

  const numericPart = normalized.match(/-?\d+(\.\d+)?/)?.[0];
  if (!numericPart) return null;
  const parsed = Number(numericPart);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

export const toNumber = parseNumber;

export function normalizeStudentId(value: unknown) {
  const text = typeof value === "number" ? String(value) : String(value ?? "");
  return text.trim().replace(/\.0$/, "");
}

export function normalizeName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

export function isProfessionalSubject(record: CourseRecord) {
  const category = normalizeSearchText(record.category);
  const subject = normalizeSearchText(record.subject);
  const combined = `${category} ${subject}`;
  return PROFESSIONAL_KEYWORDS.some((keyword) => combined.includes(normalizeSearchText(keyword)));
}

export function isGeneralSubject(record: CourseRecord) {
  if (isProfessionalSubject(record)) return false;

  const category = normalizeSearchText(record.category);
  const subject = normalizeSearchText(record.subject);
  const combined = `${category} ${subject}`;
  return GENERAL_KEYWORDS.some((keyword) => combined.includes(normalizeSearchText(keyword)));
}

export function inferCourseType(record: CourseRecord): "professional" | "general" | "unknown" {
  if (isProfessionalSubject(record)) return "professional";
  if (isGeneralSubject(record)) return "general";
  return "unknown";
}

export function calculateProfessionalStats(records: CourseRecord[]): ProfessionalStats {
  const professionalRecords = records.filter(isProfessionalSubject);
  const details = professionalRecords.map((record) => {
    const normalizedGrade = normalizeGrade(record.achievement);
    const score = achievementToScore(normalizedGrade);

    return {
      subject: record.subject,
      category: record.category,
      credit: record.credit,
      achievement: record.achievement,
      normalizedGrade,
      score,
      isA: normalizedGrade === "A",
      included: score !== null,
      exclusionReason: score === null ? "성취도 미산출" : "계산 포함",
    };
  });

  const scoredDetails = details.filter((detail) => detail.score !== null);
  if (scoredDetails.length === 0) {
    return {
      totalProfessionalSubjects: 0,
      professionalScoreSum: null,
      professionalAverageValue: null,
      condition1Passed: null,
      professionalACount: 0,
      professionalARate: null,
      condition2Passed: null,
      calculationStatus: "계산불가",
      details,
    };
  }

  const professionalScoreSum = scoredDetails.reduce((sum, detail) => sum + (detail.score ?? 0), 0);
  const totalProfessionalSubjects = scoredDetails.length;
  const professionalAverageValue = professionalScoreSum / totalProfessionalSubjects;
  const professionalACount = scoredDetails.filter((detail) => detail.isA).length;
  const professionalARate = (professionalACount / totalProfessionalSubjects) * 100;
  const condition1Passed = professionalAverageValue >= 0;
  const condition2Passed = professionalARate >= 50;

  return {
    totalProfessionalSubjects,
    professionalScoreSum,
    professionalAverageValue,
    condition1Passed,
    professionalACount,
    professionalARate,
    condition2Passed,
    calculationStatus: condition1Passed && condition2Passed ? "충족" : "미충족",
    details,
  };
}

export function calculateGeneralStats(records: CourseRecord[]): GeneralStats {
  const generalRecords = records.filter(isGeneralSubject);
  let rankGradeWeightedSum = 0;
  let rankGradeCreditSum = 0;
  let percentileWeightedSum = 0;
  let percentileCreditSum = 0;

  const details = generalRecords.map((record) => {
    const credit = record.credit > 0 ? record.credit : 1;
    const rankGrade = isValidRankGrade(record.rankGrade) ? parseNumber(record.rankGrade) : null;
    const percentile = parseNumber(record.rankPercentile);
    const rankPercentile =
      percentile !== null && percentile > 0 && percentile <= 100 ? percentile : null;

    if (rankGrade !== null) {
      rankGradeWeightedSum += credit * rankGrade;
      rankGradeCreditSum += credit;
    }

    if (rankPercentile !== null) {
      percentileWeightedSum += credit * rankPercentile;
      percentileCreditSum += credit;
    }

    const reasons: string[] = [];
    if (rankGrade === null) reasons.push("석차등급 미산출");
    if (rankPercentile === null) reasons.push("석차비율 미산출");

    return {
      subject: record.subject,
      category: record.category,
      credit,
      rankGrade,
      rankPercentile,
      includeRankGrade: rankGrade !== null,
      includePercentile: rankPercentile !== null,
      included: rankGrade !== null || rankPercentile !== null,
      exclusionReason: reasons.length > 0 ? reasons.join(", ") : "계산 포함",
    };
  });

  const generalAverageRankGrade =
    rankGradeCreditSum > 0 ? rankGradeWeightedSum / rankGradeCreditSum : null;
  const generalAveragePercentile =
    percentileCreditSum > 0 ? percentileWeightedSum / percentileCreditSum : null;

  const percentilePassed =
    generalAveragePercentile !== null ? generalAveragePercentile <= 50 : false;
  const rankGradePassed = generalAverageRankGrade !== null ? generalAverageRankGrade <= 4.5 : false;
  const condition3Passed =
    generalAveragePercentile === null && generalAverageRankGrade === null
      ? null
      : percentilePassed || rankGradePassed;

  return {
    generalAverageRankGrade,
    generalAveragePercentile,
    condition3Passed,
    calculationStatus: toStatus(condition3Passed),
    details,
  };
}

export function calculateFinalResult(
  order: number,
  input: StudentResult["input"],
  matchedRecords: CourseRecord[],
  matchStatus: StudentResult["matchStatus"],
): StudentResult {
  const professionalStats = calculateProfessionalStats(matchedRecords);
  const generalStats = calculateGeneralStats(matchedRecords);
  const studentId = matchedRecords[0]?.studentId ?? input.studentId ?? "";
  const name = matchedRecords[0]?.name ?? input.name ?? "";

  if (matchStatus === "자료 없음") {
    return {
      order,
      input,
      studentId,
      name,
      matchStatus,
      condition1Status: "자료 없음",
      condition2Status: "자료 없음",
      condition3Status: "자료 없음",
      finalStatus: "자료 없음",
      notes: ["자료 없음"],
      professionalStats,
      generalStats,
      matchedRecords,
    };
  }

  if (matchStatus === "동명이인 확인 필요") {
    return {
      order,
      input,
      studentId,
      name,
      matchStatus,
      condition1Status: "계산불가",
      condition2Status: "계산불가",
      condition3Status: "계산불가",
      finalStatus: "계산불가",
      notes: ["동명이인 확인 필요"],
      professionalStats,
      generalStats,
      matchedRecords,
    };
  }

  const condition1Status = toStatus(professionalStats.condition1Passed);
  const condition2Status = toStatus(professionalStats.condition2Passed);
  const condition3Status = toStatus(generalStats.condition3Passed);
  const hasUncalculable =
    professionalStats.condition1Passed === null ||
    professionalStats.condition2Passed === null ||
    generalStats.condition3Passed === null;

  const finalPassed =
    professionalStats.condition1Passed === true &&
    professionalStats.condition2Passed === true &&
    generalStats.condition3Passed === true;

  const finalStatus: JudgeStatus = hasUncalculable ? "계산불가" : finalPassed ? "충족" : "미충족";
  const notes = buildNotes(professionalStats, generalStats, finalStatus, matchStatus);

  return {
    order,
    input,
    studentId,
    name,
    matchStatus,
    condition1Status,
    condition2Status,
    condition3Status,
    finalStatus,
    notes,
    professionalStats,
    generalStats,
    matchedRecords,
  };
}

function buildNotes(
  professionalStats: ProfessionalStats,
  generalStats: GeneralStats,
  finalStatus: StudentResult["finalStatus"],
  matchStatus: StudentResult["matchStatus"],
) {
  const notes: string[] = [];

  if (matchStatus === "이름 불일치 확인 필요") {
    notes.push("이름 불일치 확인 필요");
  }
  if (professionalStats.condition1Passed === false) {
    notes.push("① 전문교과 평균 B 이상 미충족");
  }
  if (professionalStats.condition2Passed === false) {
    notes.push("② 전문교과 A 비율 50% 미만");
  }
  if (generalStats.condition3Passed === false) {
    notes.push("③ 보통교과 기준 미충족");
  }
  if (professionalStats.condition1Passed === null || professionalStats.condition2Passed === null) {
    notes.push("전문교과 성취도 자료 없음");
  }
  if (generalStats.condition3Passed === null) {
    notes.push("보통교과 석차등급 및 석차비율 자료 없음");
  }

  if (notes.length === 0 && finalStatus === "충족") return ["모든 기준 충족"];
  return notes.length > 0 ? notes : ["확인 필요"];
}

function toStatus(value: boolean | null): JudgeStatus {
  if (value === null) return "계산불가";
  return value ? "충족" : "미충족";
}

function normalizeSearchText(value: string) {
  return value.replace(/\s/g, "").toLowerCase();
}
