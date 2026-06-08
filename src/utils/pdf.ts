import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StudentResult } from "../types";
import { formatNumber, formatPercent, todayCompact, todayKorean } from "./format";

export function exportResultsToPdf(results: StudentResult[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFont("helvetica");
  doc.setFontSize(14);
  doc.text("보건직 공무원 응시 학생 학과성적 기준 충족 여부 검토 결과", 14, 16);

  doc.setFontSize(9);
  doc.text(`출력일: ${todayKorean()}`, 14, 24);
  doc.text("학과성적 기준: ① 전문교과 평균 B 이상 AND ② 전문교과 A 비율 50% 이상 AND (③ 평균 석차비율 50% 이내 OR 평균 석차등급 4.5 이내)", 14, 31, {
    maxWidth: 270,
  });
  doc.text("계산 기준 안내: 전문교과 성취도 A=1, B=0, C=-1, D=-2, E=-3으로 환산하며 보통교과는 학점 가중 평균으로 산출합니다.", 14, 38, {
    maxWidth: 270,
  });
  doc.text("주의: jsPDF 기본 글꼴 환경에서 한글이 깨지면 인쇄/PDF 저장 버튼을 눌러 대상 프린터를 'PDF로 저장'으로 선택하세요.", 14, 45, {
    maxWidth: 270,
  });

  autoTable(doc, {
    startY: 54,
    head: [
      [
        "순번",
        "학번",
        "이름",
        "①",
        "전문 과목",
        "평균값",
        "②",
        "A 비율",
        "③",
        "석차비율",
        "석차등급",
        "최종",
        "비고",
      ],
    ],
    body: results.map((result) => [
      result.order,
      result.studentId,
      result.name,
      result.condition1Status,
      result.professionalStats.totalProfessionalSubjects,
      formatNumber(result.professionalStats.professionalAverageValue),
      result.condition2Status,
      formatPercent(result.professionalStats.professionalARate),
      result.condition3Status,
      formatNumber(result.generalStats.generalAveragePercentile),
      formatNumber(result.generalStats.generalAverageRankGrade),
      result.finalStatus,
      result.notes.join(", "),
    ]),
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 1.5,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
    },
    columnStyles: {
      12: { cellWidth: 55 },
    },
  });

  doc.save(`보건직_학과성적_충족여부_${todayCompact()}.pdf`);
}
