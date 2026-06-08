import { Fragment, useMemo, useState, type ChangeEvent } from "react";
import type { ColumnMapping, JudgeStatus, RequiredColumn, SheetData, StudentResult } from "./types";
import {
  buildCourseRecords,
  detectColumnMapping,
  exportResultsToExcel,
  findRecordsForStudent,
  getMissingRequiredColumns,
  parseStudentInputs,
  readWorkbook,
  REQUIRED_COLUMN_LABELS,
  remapSheetWithHeaderRow,
} from "./utils/excel";
import { calculateFinalResult } from "./utils/calculations";
import { exportResultsToPdf } from "./utils/pdf";
import { formatNumber, formatPercent } from "./utils/format";

const SAMPLE_STUDENTS = `3806 박선영
3812 오하진
3815 조미현
3909 박혜진
3915 이시현`;

const MAPPING_KEYS: RequiredColumn[] = [
  "studentId",
  "name",
  "subject",
  "category",
  "credit",
  "achievement",
  "rankGrade",
  "rankPercentile",
];

type SortKey = keyof Pick<StudentResult, "order" | "studentId" | "name" | "finalStatus">;
type FilterValue = "전체" | JudgeStatus;

function App() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({
    studentId: "",
    name: "",
    subject: "",
    category: "",
    credit: "",
    achievement: "",
    rankGrade: "",
    rankPercentile: "",
  });
  const [studentText, setStudentText] = useState(SAMPLE_STUDENTS);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("order");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<FilterValue>("전체");
  const [search, setSearch] = useState("");

  const selectedSheet = useMemo(
    () => sheets.find((sheet) => sheet.name === selectedSheetName),
    [selectedSheetName, sheets],
  );

  const filteredResults = useMemo(() => {
    const searched = results.filter((result) => {
      const filterMatches = filter === "전체" || result.finalStatus === filter;
      const searchText = `${result.studentId} ${result.name} ${result.finalStatus} ${result.notes.join(" ")}`;
      const searchMatches = search.trim() ? searchText.includes(search.trim()) : true;
      return filterMatches && searchMatches;
    });

    return searched.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const compare = String(left).localeCompare(String(right), "ko", { numeric: true });
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [filter, results, search, sortDirection, sortKey]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setMessage(".xlsx 파일만 업로드할 수 있습니다.");
      return;
    }

    setIsReading(true);
    setMessage("엑셀 파일을 읽는 중입니다.");

    try {
      const parsedSheets = await readWorkbook(file);
      if (parsedSheets.length === 0) {
        setMessage("읽을 수 있는 시트를 찾지 못했습니다.");
        return;
      }

      const firstSheet = parsedSheets[0];
      setFileName(file.name);
      setSheets(parsedSheets);
      setSelectedSheetName(firstSheet.name);
      setMapping(detectColumnMapping(firstSheet.headers));
      setResults([]);
      setExpandedOrder(null);
      setMessage(`${parsedSheets.length}개 시트를 읽었습니다. 열 매핑을 확인해 주세요.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "엑셀 파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      setIsReading(false);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    const sheet = sheets.find((item) => item.name === sheetName);
    setSelectedSheetName(sheetName);
    if (sheet) {
      setMapping(detectColumnMapping(sheet.headers));
      setResults([]);
      setExpandedOrder(null);
      setMessage(`'${sheet.name}' 시트의 열을 자동 인식했습니다. 필요하면 직접 수정하세요.`);
    }
  };

  const handleHeaderRowChange = (value: string) => {
    if (!selectedSheet) return;

    const nextSheet = remapSheetWithHeaderRow(selectedSheet, Number(value));
    setSheets((current) =>
      current.map((sheet) => (sheet.name === selectedSheet.name ? nextSheet : sheet)),
    );
    setMapping(detectColumnMapping(nextSheet.headers));
    setResults([]);
    setExpandedOrder(null);
    setMessage(`${nextSheet.headerRowIndex + 1}행을 헤더로 다시 인식했습니다.`);
  };

  const updateMapping = (key: RequiredColumn, value: string) => {
    setMapping((current) => ({ ...current, [key]: value }));
  };

  const calculate = () => {
    if (!selectedSheet) {
      setMessage("성적 엑셀 파일을 먼저 업로드해주세요.");
      return;
    }

    const studentInputs = parseStudentInputs(studentText);
    if (studentInputs.length === 0) {
      setMessage("검토할 학생을 입력해주세요.");
      return;
    }

    const missing = getMissingRequiredColumns(mapping);
    if (missing.length > 0) {
      setMessage(`필수 열 매핑이 부족합니다: ${missing.join(", ")}`);
      return;
    }

    const records = buildCourseRecords(selectedSheet.rows, mapping);
    const nextResults = studentInputs.map((input, index) => {
      const match = findRecordsForStudent(input, records);
      return calculateFinalResult(index + 1, input, match.records, match.status);
    });

    setResults(nextResults);
    setExpandedOrder(null);
    setMessage(`${nextResults.length}명의 충족 여부를 계산했습니다.`);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">브라우저 내부 처리 · 서버 업로드 없음</p>
          <h1>보건직 공무원 응시 학생 학과성적 기준 검토 도구</h1>
          <p>
            성적 엑셀 파일을 업로드하고 검토 대상 학생을 입력하면 전문교과·보통교과
            기준 충족 여부를 자동 계산합니다.
          </p>
        </div>
      </header>

      <main>
        <section className="step-panel no-print">
          <div className="step-heading">
            <span>1단계</span>
            <h2>성적 엑셀 파일 업로드</h2>
          </div>
          <div className="upload-box">
            <input type="file" accept=".xlsx" onChange={handleFileChange} />
            <div>
              <strong>{fileName || ".xlsx 파일을 선택해 주세요"}</strong>
              <p>업로드된 파일은 브라우저 메모리에서만 읽고 외부 서버로 전송하지 않습니다.</p>
            </div>
          </div>
          {isReading && <p className="status-line">파일을 분석하는 중입니다.</p>}
          {sheets.length > 0 && (
            <div className="inline-field">
              <label htmlFor="sheetSelect">읽은 시트</label>
              <select
                id="sheetSelect"
                value={selectedSheetName}
                onChange={(event) => handleSheetChange(event.target.value)}
              >
                {sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name} · 헤더 {sheet.headerRowIndex + 1}행 · 자료 {sheet.rows.length}행
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="step-panel no-print">
          <div className="step-heading">
            <span>2단계</span>
            <h2>열 매핑 확인</h2>
          </div>
          {selectedSheet ? (
            <>
              <div className="mapping-summary">
                <label className="header-row-field">
                  <span>헤더 행 번호</span>
                  <input
                    type="number"
                    min={1}
                    max={selectedSheet.matrix.length || 1}
                    value={selectedSheet.headerRowIndex + 1}
                    onChange={(event) => handleHeaderRowChange(event.target.value)}
                  />
                </label>
                <p>
                  자동 인식된 헤더: {selectedSheet.headers.join(", ")} · 자료 {selectedSheet.rows.length}행
                </p>
              </div>
              <div className="mapping-grid">
                {MAPPING_KEYS.map((key) => (
                  <label key={key} className="mapping-field">
                    <span>{REQUIRED_COLUMN_LABELS[key]}</span>
                    <select value={mapping[key]} onChange={(event) => updateMapping(key, event.target.value)}>
                      <option value="">선택 안 함</option>
                      {selectedSheet.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-state">엑셀 파일을 업로드하면 자동으로 열을 인식합니다.</p>
          )}
        </section>

        <section className="step-panel no-print">
          <div className="step-heading">
            <span>3단계</span>
            <h2>검토 대상 학생 입력</h2>
          </div>
          <textarea
            value={studentText}
            onChange={(event) => setStudentText(event.target.value)}
            rows={7}
            placeholder={SAMPLE_STUDENTS}
          />
          <p className="help-text">
            한 줄에 한 명씩 입력합니다. 학번만, 이름만, 또는 “학번 이름” 형식을 모두 지원합니다.
          </p>
        </section>

        <section className="action-bar no-print">
          <button className="primary-button" onClick={calculate}>
            충족 여부 계산하기
          </button>
          <div className="output-buttons">
            <button disabled={results.length === 0} onClick={() => exportResultsToExcel(results)}>
              엑셀 다운로드
            </button>
            <button disabled={results.length === 0} onClick={() => exportResultsToPdf(results)}>
              PDF 다운로드
            </button>
            <button disabled={results.length === 0} onClick={() => window.print()}>
              인쇄/PDF 저장
            </button>
          </div>
        </section>

        {message && <div className="message no-print">{message}</div>}

        <section className="print-area">
          <h2 className="print-title">
            보건직 공무원 응시 학생 학과성적 기준 충족 여부 검토 결과
          </h2>
          <div className="criteria-box">
            <h2>판정 기준</h2>
            <p>
              최종 충족 여부 = ① 전문교과 평균 B 이상 AND ② 전문교과 A 비율 50% 이상 AND
              (③-1 보통교과 평균 석차비율 50% 이내 OR ③-2 평균 석차등급 4.5 이내)
            </p>
          </div>

          {results.length > 0 && (
            <section className="results-section">
              <div className="results-header no-print">
                <div>
                  <p className="eyebrow">5단계</p>
                  <h2>결과표</h2>
                </div>
                <div className="table-tools">
                  <select value={filter} onChange={(event) => setFilter(event.target.value as FilterValue)}>
                    <option value="전체">전체</option>
                    <option value="충족">충족</option>
                    <option value="미충족">미충족</option>
                    <option value="계산불가">계산불가</option>
                    <option value="자료 없음">자료 없음</option>
                  </select>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="학번, 이름, 비고 검색"
                  />
                </div>
              </div>

              <div className="table-scroll">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>
                        <button onClick={() => toggleSort("order")}>순번</button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort("studentId")}>학번</button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort("name")}>이름</button>
                      </th>
                      <th>① 전문교과 평균 B 이상 여부</th>
                      <th>전문교과 총 과목 수</th>
                      <th>전문교과 환산점수 합계</th>
                      <th>전문교과 평균 산출값</th>
                      <th>② 전문교과 A 비율 50% 이상 여부</th>
                      <th>전문교과 A 과목 수</th>
                      <th>전문교과 A 비율(%)</th>
                      <th>③ 보통교과 기준 충족 여부</th>
                      <th>보통교과 평균 석차비율</th>
                      <th>보통교과 평균 석차등급</th>
                      <th>
                        <button onClick={() => toggleSort("finalStatus")}>최종 충족 여부</button>
                      </th>
                      <th>비고</th>
                      <th className="no-print">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((result) => (
                      <Fragment key={result.order}>
                        <tr className={result.finalStatus === "충족" ? "passed-row" : ""}>
                          <td>{result.order}</td>
                          <td>{result.studentId || "-"}</td>
                          <td>{result.name || "-"}</td>
                          <td>
                            <StatusBadge status={result.condition1Status} />
                          </td>
                          <td>{result.professionalStats.totalProfessionalSubjects}</td>
                          <td>{result.professionalStats.professionalScoreSum ?? "-"}</td>
                          <td>{formatNumber(result.professionalStats.professionalAverageValue)}</td>
                          <td>
                            <StatusBadge status={result.condition2Status} />
                          </td>
                          <td>{result.professionalStats.professionalACount}</td>
                          <td>{formatPercent(result.professionalStats.professionalARate)}</td>
                          <td>
                            <StatusBadge status={result.condition3Status} />
                          </td>
                          <td>{formatNumber(result.generalStats.generalAveragePercentile)}</td>
                          <td>{formatNumber(result.generalStats.generalAverageRankGrade)}</td>
                          <td>
                            <StatusBadge status={result.finalStatus} large />
                          </td>
                          <td className="notes-cell">{result.notes.join(", ")}</td>
                          <td className="no-print">
                            <button
                              className="small-button"
                              onClick={() =>
                                setExpandedOrder(expandedOrder === result.order ? null : result.order)
                              }
                            >
                              상세보기
                            </button>
                          </td>
                        </tr>
                        {expandedOrder === result.order && (
                          <tr className="detail-row no-print">
                            <td colSpan={16}>
                              <StudentDetail result={result} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusBadge({ status, large = false }: { status: string; large?: boolean }) {
  const className = `badge ${large ? "badge-large" : ""} ${statusToClass(status)}`;
  return <span className={className}>{status}</span>;
}

function StudentDetail({ result }: { result: StudentResult }) {
  return (
    <div className="detail-grid">
      <div>
        <h3>전문교과 목록</h3>
        <table className="detail-table">
          <thead>
            <tr>
              <th>과목명</th>
              <th>교과구분</th>
              <th>학점</th>
              <th>성취도</th>
              <th>환산점수</th>
              <th>A 여부</th>
              <th>계산 포함 여부</th>
            </tr>
          </thead>
          <tbody>
            {result.professionalStats.details.length > 0 ? (
              result.professionalStats.details.map((detail, index) => (
                <tr key={`${detail.subject}-${index}`}>
                  <td>{detail.subject}</td>
                  <td>{detail.category || "-"}</td>
                  <td>{detail.credit}</td>
                  <td>{detail.achievement || "-"}</td>
                  <td>{detail.score ?? "-"}</td>
                  <td>{detail.isA ? "예" : "아니오"}</td>
                  <td>{detail.included ? "포함" : `제외: ${detail.exclusionReason}`}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>전문교과로 분류된 과목이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h3>보통교과 목록</h3>
        <table className="detail-table">
          <thead>
            <tr>
              <th>과목명</th>
              <th>교과구분</th>
              <th>학점</th>
              <th>석차등급</th>
              <th>석차비율</th>
              <th>계산 포함 여부</th>
              <th>제외 사유</th>
            </tr>
          </thead>
          <tbody>
            {result.generalStats.details.length > 0 ? (
              result.generalStats.details.map((detail, index) => (
                <tr key={`${detail.subject}-${index}`}>
                  <td>{detail.subject}</td>
                  <td>{detail.category || "-"}</td>
                  <td>{detail.credit}</td>
                  <td>{detail.rankGrade ?? "-"}</td>
                  <td>{detail.rankPercentile ?? "-"}</td>
                  <td>{detail.includeRankGrade || detail.includePercentile ? "포함" : "제외"}</td>
                  <td>{detail.exclusionReason}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>보통교과로 분류된 과목이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusToClass(status: string) {
  if (status === "충족") return "badge-pass";
  if (status === "미충족") return "badge-fail";
  if (status === "계산불가") return "badge-unknown";
  if (status === "자료 없음") return "badge-missing";
  if (status === "동명이인 확인 필요") return "badge-warning";
  return "badge-unknown";
}

export default App;
