import { handleReviewRequest } from "@/lib/ai/review-handler";

export async function POST(request: Request): Promise<Response> {
  return handleReviewRequest(request, {});
}
