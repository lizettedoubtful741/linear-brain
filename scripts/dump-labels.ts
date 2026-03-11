import { linearClient } from "../src/linear/client.ts";

let after: string | undefined;
let page = 0;

while (true) {
  const result = await linearClient.issueLabels({ first: 100, after });
  page++;
  console.error(`[page ${page}] fetched ${result.nodes.length} labels`);

  for (const label of result.nodes) {
    const parent = await label.parent;
    const team = await label.team;
    console.log(JSON.stringify({
      id: label.id,
      name: label.name,
      color: label.color,
      parentName: parent?.name ?? null,
      parentId: parent?.id ?? null,
      teamName: team?.name ?? null,
      teamId: team?.id ?? null,
    }));
  }

  if (!result.pageInfo.hasNextPage) break;
  after = result.pageInfo.endCursor;
}
