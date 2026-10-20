TECH_KEYWORDS = [
    # Languages
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
    # Frontend
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
    # Backend / infra
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
    # Data
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
    # Cloud / DevOps
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
    # Mobile
    "Android",
    "iOS",
    "Flutter",
    "React Native",
    # AI / ML
    "Machine Learning",
    "Deep Learning",
    "TensorFlow",
    "PyTorch",
    "LLM",
    "NLP",
    "Computer Vision",
    # Game
    "Unity",
    "Unreal",
    "Cocos",
    # Soft / process
    "Agile",
    "Scrum",
    "Jira",
    "Figma",
]


def extract_keywords(description: str) -> list[str]:
    if not description:
        return []
    lower = description.lower()
    found = [kw for kw in TECH_KEYWORDS if kw.lower() in lower]
    return sorted(set(found), key=str.lower)
