"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // matches the `documents` bucket's file_size_limit

export function DocumentUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setTitle("");
      setCategory("");
      setDescription("");
      setFile(null);
    }
    onOpenChange(next);
  }

  async function handleUpload() {
    if (!title.trim()) {
      toast.error("กรุณาระบุชื่อเอกสาร");
      return;
    }
    if (!file) {
      toast.error("กรุณาเลือกไฟล์");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("ไฟล์ใหญ่เกิน 20MB");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const storagePath = `${crypto.randomUUID()}/${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) {
      toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + uploadError.message);
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.rpc("save_document_record", {
      p_title: title.trim(),
      p_category: category.trim(),
      p_file_name: file.name,
      p_storage_path: storagePath,
      p_description: description.trim() || null,
    });
    setSaving(false);

    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "บันทึกไม่สำเร็จ");
      // best-effort cleanup so a failed record doesn't leave an orphaned blob
      await supabase.storage.from("documents").remove([storagePath]);
      return;
    }

    toast.success(data.message ?? "เพิ่มเอกสารสำเร็จ!");
    onUploaded();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>+ เพิ่มเอกสาร</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>ชื่อเอกสาร</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>หมวดหมู่ (ไม่บังคับ)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="เช่น สัญญา, ใบเสร็จซื้อของ"
            />
          </div>
          <div>
            <Label>รายละเอียด (ไม่บังคับ)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>ไฟล์ (PDF / รูปภาพ / Word / Excel, สูงสุด 20MB)</Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <Button onClick={handleUpload} disabled={saving} className="w-full">
          {saving ? "กำลังอัปโหลด..." : "💾 อัปโหลด"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
