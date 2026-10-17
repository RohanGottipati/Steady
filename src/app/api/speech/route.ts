import { handleSpeechRequest } from "@/lib/voice/speech-handler";

export async function POST(request: Request): Promise<Response> {
  return handleSpeechRequest(request);
}
