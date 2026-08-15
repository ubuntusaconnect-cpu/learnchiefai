import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ChatAttachmentRow {
  id: string;
  message_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  storage_path: string;
}

function useSignedUrl(path: string, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    supabase.storage.from("chat-attachments").createSignedUrl(path, 3600).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [path, enabled]);
  return url;
}

function AttachmentChip({ item }: { item: ChatAttachmentRow }) {
  const isImage = item.kind === "image" || item.mime_type.startsWith("image/");
  const url = useSignedUrl(item.storage_path, true);

  if (isImage) {
    return (
      <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" className="block">
        {url ? (
          <img
            src={url}
            alt={item.file_name}
            loading="lazy"
            className="max-h-48 rounded-lg border border-white/20 object-cover"
          />
        ) : (
          <div className="h-24 w-32 animate-pulse rounded-lg bg-white/20" />
        )}
      </a>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="max-w-[12rem] truncate">{item.file_name}</span>
      <Download className="h-3 w-3 shrink-0 opacity-70" />
    </a>
  );
}

export function AttachmentChips({ items }: { items: ChatAttachmentRow[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <AttachmentChip key={item.id} item={item} />
      ))}
    </div>
  );
}
