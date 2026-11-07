import { createClient, supabaseBrowserConfig } from "@/lib/supabase/client";

// Uploads straight to private storage, reporting progress. The Supabase client's own upload has no
// progress events, and a student on a slow connection needs to see that a large file is still moving.
// Storage policies apply exactly as they do for the client's upload.
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ error?: string }> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "Your session has ended. Please log in again." };
  const { url, key } = supabaseBrowserConfig();
  const encoded = path.split("/").map(encodeURIComponent).join("/");

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${url}/storage/v1/object/${bucket}/${encoded}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({});
      let message = "Upload failed";
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {}
      resolve({ error: message });
    };
    xhr.onerror = () => resolve({ error: "Upload failed. Check your connection and try again." });
    xhr.send(file);
  });
}
