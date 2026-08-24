// 统一的文件下载封装：Blob → 临时链接 → 触发下载 → 清理

export function downloadBlob(parts: BlobPart[], mime: string, filename: string): void {
  const blob = new Blob(parts, { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 文件名：<base>-<YYYYMMDD-HHmm>.<ext>，避免时间戳过长且便于排序
export function buildFilename(base: string, ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${base}-${stamp}.${ext}`;
}
