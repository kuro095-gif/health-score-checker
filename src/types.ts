export type RequiredColumn =
  | "studentId"
  | "name"
  | "subject"
  | "category"
  | "credit"
  | "achievement"
  | "rankGrade"
  | "rankPercentile";

export type JudgeStatus = "충족" | "미충족" | "계산불가" | "자료 없음";

export type MatchStatus =
  | "정상"
  | "이름 불일치 확인 필요"
  | "동명이인 확인 필요"
  | "자료 없음";

export type ColumnMapping = Record<RequiredColumn, string>;

export type SheetData = {
  name: string;
  headerRowIndex: number;
  headers: string[];
  rows: RawRow[];
  matrix: unknown[][];
};

export type RawRow = Record<string, unknown>;

export type StudentInput = {
  order: number;
  original: string;
  studentId?: string;
  name?: string;
};

export type CourseRecord = {
  studentId: string;
  name: string;
  subject: string;
  category: string;
  credit: number;
  achievement: string;
  rankGrade: unknown;
  rankPercentile: unknown;
  raw: RawRow;
};

export type ProfessionalDetail = {
  subject: string;
  category: string;
  credit: number;
  achievement: string;
  normalizedGrade: "A" | "B" | "C" | "D" | "E" | null;
  score: number | null;
  isA: boolean;
  included: boolean;
  exclusionReason: string;
};

export type GeneralDetail = {
  subject: string;
  category: string;
  credit: number;
  rankGrade: number | null;
  rankPercentile: number | null;
  includeRankGrade: boolean;
  includePercentile: boolean;
  included: boolean;
  exclusionReason: string;
};

export type ProfessionalStats = {
  totalProfessionalSubjects: number;
  professionalScoreSum: number | null;
  professionalAverageValue: number | null;
  condition1Passed: boolean | null;
  professionalACount: number;
  professionalARate: number | null;
  condition2Passed: boolean | null;
  calculationStatus: JudgeStatus;
  details: ProfessionalDetail[];
};

export type GeneralStats = {
  generalAverageRankGrade: number | null;
  generalAveragePercentile: number | null;
  condition3Passed: boolean | null;
  calculationStatus: JudgeStatus;
  details: GeneralDetail[];
};

export type StudentResult = {
  order: number;
  input: StudentInput;
  studentId: string;
  name: string;
  matchStatus: MatchStatus;
  condition1Status: JudgeStatus;
  condition2Status: JudgeStatus;
  condition3Status: JudgeStatus;
  finalStatus: JudgeStatus;
  notes: string[];
  professionalStats: ProfessionalStats;
  generalStats: GeneralStats;
  matchedRecords: CourseRecord[];
};
