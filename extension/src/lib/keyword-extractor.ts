/** Mirrors backend/app/services/keyword_extractor.py — tech keywords only. */

export const TECH_KEYWORDS = [
  // Languages
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "Go",
  "Golang",
  "Kotlin",
  "Swift",
  "C++",
  "C#",
  "C",
  "Oracle",
  "RDBMS",
  "Rust",
  "Ruby",
  "PHP",
  "Scala",
  // Frontend
  "React",
  "Vue",
  "Vue.js",
  "Angular",
  "Next.js",
  "Nuxt",
  "Svelte",
  "HTML",
  "CSS",
  "Tailwind",
  "Webpack",
  // Backend / infra
  "Node.js",
  "NestJS",
  "Spring",
  "Spring Boot",
  "Django",
  "FastAPI",
  "Flask",
  "Express",
  "GraphQL",
  "REST",
  "gRPC",
  // Data
  "SQL",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "Elasticsearch",
  "Kafka",
  "Spark",
  "Hadoop",
  "BigQuery",
  // Cloud / DevOps
  "AWS",
  "GCP",
  "Azure",
  "Docker",
  "Kubernetes",
  "Terraform",
  "CI/CD",
  "Jenkins",
  "GitHub Actions",
  "Linux",
  // Mobile
  "Android",
  "iOS",
  "Flutter",
  "React Native",
  // AI / ML
  "Machine Learning",
  "Deep Learning",
  "TensorFlow",
  "PyTorch",
  "LLM",
  "NLP",
  "Computer Vision",
  // Game
  "Unity",
  "Unreal",
  "Cocos",
  // Soft / process
  "Agile",
  "Scrum",
  "Jira",
  "Figma",
  "AI 개발 생산성 개선",
  "영어",
  "컴퓨터 공학",
  "소프트웨어 공학",
  "정보보안 공학",
  "정보통신 공학",
  "IT 관련학과",
  "IT 유관 전공",
  "NestJs",
  "Websocket",
  "Jest",
  "RTL",
  "Cypress",
  "컴포넌트 설계",
  "상태 관리",
  "App Router",
  "Server Component",
  "TanStack Query",
  "Zustand",
  "React Hook Form",
  "Zod",
  "Feature Sliced Design",
  "Electron",
  "Cross platform",
  "백엔드",
  "프론트엔드",
  "서버",
  "BSS",
  "OSS",
  "CRM",
  "플랫폼 서비스",
  "통신 IT 시스템",
  "AWS",
  "Azure",
  "Public Cloud",
  "RESTful",
  "학사 학위 이상"
] as const;

const TECH_SET = new Set(TECH_KEYWORDS.map((k) => k.toLowerCase()));

/** Longer keywords first so "Spring Boot" wins over "Spring". */
const SORTED = [...TECH_KEYWORDS].sort((a, b) => b.length - a.length);

function keywordHit(haystack: string, kw: string): boolean {
  const k = kw.toLowerCase();
  if (k.length > 2) return haystack.includes(k);
  // "C"/"Go" must not match inside JavaScript or Golang
  return new RegExp(`(?:^|[^a-z0-9])${k}(?:[^a-z0-9]|$)`, "i").test(haystack);
}

export function extractKeywords(description: string): string[] {
  if (!description) return [];
  // NextJS / NestJS (no dot) still match VOCAB "Next.js" / "NestJS"
  const lower = description
    .toLowerCase()
    .replace(/next\s*\.?js/g, "next.js")
    .replace(/nest\s*\.?js/g, "nestjs")
    .replace(/c언어/g, " c ");
  const found = SORTED.filter((kw) => keywordHit(lower, kw));
  return [...new Set(found)].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

export function selfCheckKeywords(): void {
  const js = extractKeywords("JavaScript CSS React");
  if (js.includes("C")) throw new Error("C matched inside JavaScript");
  const row = extractKeywords("C언어, Java, Spring, Oracle, MySQL, RDBMS");
  for (const name of ["C", "Java", "Spring", "Oracle", "MySQL", "RDBMS"]) {
    if (!row.includes(name)) throw new Error(`missing ${name}`);
  }
}

export function isTechKeyword(s: string): boolean {
  return TECH_SET.has(s.trim().toLowerCase());
}
