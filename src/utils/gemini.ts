function joinUrl(base: string, path: string) {
  if (!base) return path; 
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function askGemini(question: string, context: string) {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    const url = joinUrl(baseUrl, "/api/chat");

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const err = await response.json();
        throw new Error(err.detail || "Backend Error");
      } else {
        const text = await response.text();
        throw new Error(text.slice(0, 200) || "Backend Error");
      }
    }

    const data = await response.json();
    return data.answer;
  } catch (error) {
    console.error("AI Service Error:", error);
    return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}
