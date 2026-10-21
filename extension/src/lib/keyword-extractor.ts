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
  "NestJs",
  "Websocket",
  "Jest",
  "RTL",
  "Cypress",
  "컴포넌트 설계",
  "상태 관리",

] as const;

const TECH_SET = new Set(TECH_KEYWORDS.map((k) => k.toLowerCase()));

/** Longer keywords first so "Spring Boot" wins over "Spring". */
const SORTED = [...TECH_KEYWORDS].sort((a, b) => b.length - a.length);

export function extractKeywords(description: string): string[] {
  if (!description) return [];
  // NextJS / NestJS (no dot) still match VOCAB "Next.js" / "NestJS"
  const lower = description
    .toLowerCase()
    .replace(/next\s*\.?js/g, "next.js")
    .replace(/nest\s*\.?js/g, "nestjs");
  const found = SORTED.filter((kw) => lower.includes(kw.toLowerCase()));
  return [...new Set(found)].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

export function isTechKeyword(s: string): boolean {
  return TECH_SET.has(s.trim().toLowerCase());
}

/** Light groups for matrix column headers (optional). */
export function techGroup(tag: string): string {
  const t = tag.toLowerCase();
  if (
    /python|java|javascript|typescript|golang|^go$|kotlin|swift|c\+\+|c#|rust|ruby|php|scala/.test(
      t
    )
  )
    return "언어";
  if (
    /react|vue|angular|next|nuxt|svelte|html|css|tailwind|webpack|flutter|native/.test(
      t
    )
  )
    return "프론트엔드";
  if (
    /node|nest|spring|django|fastapi|flask|express|graphql|rest|grpc/.test(t)
  )
    return "백엔드";
  if (
    /sql|mysql|postgres|mongo|redis|elastic|kafka|spark|hadoop|bigquery/.test(t)
  )
    return "데이터";
  if (
    /aws|gcp|azure|docker|kubernetes|terraform|ci\/cd|jenkins|github actions|linux/.test(
      t
    )
  )
    return "클라우드·DevOps";
  if (/android|ios|flutter|react native/.test(t)) return "모바일";
  if (
    /machine|deep learning|tensorflow|pytorch|llm|nlp|computer vision/.test(t)
  )
    return "AI·ML";
  if (/unity|unreal|cocos/.test(t)) return "게임";
  return "기타";
}

export const GROUP_NAMES = [
  "언어",
  "프론트엔드",
  "백엔드",
  "데이터",
  "클라우드·DevOps",
  "모바일",
  "AI·ML",
  "게임",
  "기타",
];
