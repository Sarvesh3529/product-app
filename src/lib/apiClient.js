export async function postJSON(url, data, token) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}\n${txt}`);
  }
  return await res.json();
}

export async function postFormData(url, formData, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}\n${txt}`);
  }
  // If response is binary (e.g., a GLB), return a Blob
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/octet-stream") || contentType.includes("model/gltf-binary")) {
    return await res.blob();
  }
  return await res.json();
}
