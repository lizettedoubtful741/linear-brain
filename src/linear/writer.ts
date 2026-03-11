/**
 * writer.ts — ALL Linear write operations live here.
 *
 * ⚠️  THIS FILE MUST ONLY BE IMPORTED BY src/queue/executor.ts ⚠️
 *
 * No other module should ever import from this file or call the Linear SDK
 * mutation methods directly. All writes flow through the executor, which
 * verifies that a proposal is approved before calling anything here.
 */

import { linearClient } from "./client.ts";

type IssueCreateInput = Parameters<typeof linearClient.createIssue>[0];
type IssueUpdateInput = Parameters<typeof linearClient.updateIssue>[1];
type CommentCreateInput = Parameters<typeof linearClient.createComment>[0];

export async function createIssue(payload: IssueCreateInput): Promise<{ id: string; identifier: string }> {
  const result = await linearClient.createIssue(payload);
  if (!result.success || !result.issue) {
    throw new Error("createIssue failed — Linear returned no issue");
  }
  const issue = await result.issue;
  if (!issue) throw new Error("createIssue failed — could not resolve issue");
  console.log(`[writer] Created issue ${issue.identifier}`);
  return { id: issue.id, identifier: issue.identifier };
}

export async function updateIssue(id: string, payload: IssueUpdateInput): Promise<{ id: string; identifier: string }> {
  const result = await linearClient.updateIssue(id, payload);
  if (!result.success || !result.issue) {
    throw new Error(`updateIssue(${id}) failed — Linear returned no issue`);
  }
  const issue = await result.issue;
  if (!issue) throw new Error(`updateIssue(${id}) failed — could not resolve issue`);
  console.log(`[writer] Updated issue ${issue.identifier}`);
  return { id: issue.id, identifier: issue.identifier };
}

export async function addComment(payload: CommentCreateInput): Promise<{ id: string }> {
  const result = await linearClient.createComment(payload);
  if (!result.success || !result.comment) {
    throw new Error("addComment failed — Linear returned no comment");
  }
  const comment = await result.comment;
  if (!comment) throw new Error("addComment failed — could not resolve comment");
  console.log(`[writer] Added comment ${comment.id}`);
  return { id: comment.id };
}
