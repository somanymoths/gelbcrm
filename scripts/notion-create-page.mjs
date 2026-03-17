#!/usr/bin/env node

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const title = readArg('--title');
const databaseId = readArg('--database-id');
const branch = readArg('--branch');
const body = readArg('--body');

if (!title) {
  console.error('Missing required argument: --title');
  process.exit(1);
}

if (!databaseId) {
  console.error('Missing required argument: --database-id');
  process.exit(1);
}

const token = process.env.NOTION_TOKEN;

if (!token) {
  console.error('Missing NOTION_TOKEN');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28'
};

const databaseResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
  headers
});

if (!databaseResponse.ok) {
  console.error(`Failed to read Notion database: ${databaseResponse.status} ${databaseResponse.statusText}`);
  process.exit(1);
}

const database = await databaseResponse.json();
const titlePropertyEntry = Object.entries(database.properties ?? {}).find(([, property]) => property?.type === 'title');

if (!titlePropertyEntry) {
  console.error('Could not find a title property in the target Notion database');
  process.exit(1);
}

const [titlePropertyName] = titlePropertyEntry;

const paragraphLines = [
  `Task: ${title}`,
  branch ? `Branch: ${branch}` : null,
  body ?? null
].filter(Boolean);

const payload = {
  parent: {
    database_id: databaseId
  },
  properties: {
    [titlePropertyName]: {
      title: [
        {
          text: {
            content: title
          }
        }
      ]
    }
  },
  children: paragraphLines.length
    ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: paragraphLines.join('\n')
                }
              }
            ]
          }
        }
      ]
    : []
};

const createResponse = await fetch('https://api.notion.com/v1/pages', {
  method: 'POST',
  headers,
  body: JSON.stringify(payload)
});

if (!createResponse.ok) {
  const errorText = await createResponse.text();
  console.error(`Failed to create Notion page: ${createResponse.status} ${createResponse.statusText}`);
  console.error(errorText);
  process.exit(1);
}

const page = await createResponse.json();
console.log(page.url);
