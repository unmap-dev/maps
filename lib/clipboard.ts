import { toast } from "@/components/ui/toast";

export async function copyText(text: string, title = "Copied") {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    toast.add({ title, type: "success" });
    return true;
  } catch {
    toast.add({ title: "Couldn't copy", description: "Select the text and copy it manually.", type: "error" });
    return false;
  }
}
