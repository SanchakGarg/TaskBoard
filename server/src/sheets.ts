import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { sql, type GoogleToken, type ProjectSheetLink } from "./db";
import { config } from "./config";
import crypto from "node:crypto";

const ALGORITHM = "aes-256-cbc";

export function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(config.encryptionKey, "salt", 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function decrypt(text: string) {
  const [ivHex, encryptedText] = text.split(":");
  if (!ivHex || !encryptedText) return text; 
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(config.encryptionKey, "salt", 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function getGoogleAuth(userId: string): Promise<OAuth2Client> {
  const [token] = await sql<GoogleToken[]>`SELECT * FROM google_tokens WHERE user_id = ${userId}`;
  if (!token) throw new Error("Google account not connected");

  const oauth2Client = new google.auth.OAuth2(
    config.auth.google.clientId,
    config.auth.google.clientSecret,
    `${config.appUrl}/api/auth/google/callback`
  );

  let refreshToken = token.refresh_token;
  if (refreshToken && refreshToken.includes(":")) {
    try {
      refreshToken = decrypt(refreshToken);
    } catch (e) {
      console.warn("Failed to decrypt refresh token, using as-is");
    }
  }

  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: refreshToken || undefined,
    expiry_date: token.expiry_date ? Number(token.expiry_date) : undefined,
  });

  oauth2Client.on("tokens", async (newTokens) => {
    if (newTokens.access_token) {
      await sql`
        UPDATE google_tokens SET
          access_token = ${newTokens.access_token},
          expiry_date = ${newTokens.expiry_date ? String(newTokens.expiry_date) : null},
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${userId}
      `;
    }
  });

  return oauth2Client;
}

export async function addStatusValidation(userId: string, projectId: string, spreadsheetId: string, sheetId: string) {
  const auth = await getGoogleAuth(userId);
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  const columns = await sql<{ name: string }[]>`SELECT name FROM columns WHERE project_id = ${projectId} ORDER BY position`;
  const columnNames = columns.map((c) => c.name);

  if (columnNames.length === 0) return;

  const tableId = projectId.replace(/-/g, "").substring(0, 9);
  
  try {
    // 1. Try updating as a Table "typed column" (New Google Sheets feature)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateTable: {
              table: {
                tableId,
                columnProperties: [
                  {
                    columnIndex: 5,
                    columnType: "DROPDOWN",
                    dataValidationRule: {
                      condition: {
                        type: "ONE_OF_LIST",
                        values: columnNames.map((name) => ({ userEnteredValue: name })),
                      },
                    },
                  },
                ],
              },
              fields: "columnProperties(columnType,dataValidationRule)",
            } as any,
          },
        ],
      },
    });
  } catch (err: any) {
    // If table doesn't exist or updateTable isn't supported, fall back to standard data validation
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            setDataValidation: {
              range: {
                sheetId: Number(sheetId),
                startRowIndex: 1, 
                endRowIndex: 1000,
                startColumnIndex: 5, 
                endColumnIndex: 6,
              },
              rule: {
                condition: {
                  type: "ONE_OF_LIST",
                  values: columnNames.map((name) => ({ userEnteredValue: name })),
                },
                showCustomUi: true,
                strict: true,
              },
            },
          },
        ],
      },
    }).catch(innerErr => {
      console.warn("Both updateTable and setDataValidation failed for status validation:", innerErr.message);
    });
  }
}

export async function createProjectSheet(userId: string, projectName: string, projectId: string) {
  const auth = await getGoogleAuth(userId);
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  const resource = {
    properties: {
      title: `Taskboard: ${projectName}`,
    },
  };

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: resource,
    fields: "spreadsheetId,spreadsheetUrl,sheets",
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet");

  const sheetId = String(spreadsheet.data.sheets?.[0]?.properties?.sheetId ?? 0);

  const headers = [
    "ID (Internal)",
    "Task Name",
    "Description",
    "Progress %",
    "Assignees",
    "Status",
    "Due Date",
    "Priority",
    "Tags",
    "_version",
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [headers],
    },
  });

  const columns = await sql<{ name: string }[]>`SELECT name FROM columns WHERE project_id = ${projectId} ORDER BY position`;
  const statusOptions = columns.map(c => c.name);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: Number(sheetId),
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: Number(sheetId), dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
            properties: { hiddenByUser: true },
            fields: "hiddenByUser",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId: Number(sheetId), dimension: "COLUMNS", startIndex: 9, endIndex: 10 },
            properties: { hiddenByUser: true },
            fields: "hiddenByUser",
          },
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId: Number(sheetId), startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 5, endColumnIndex: 6 }],
              booleanRule: {
                condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "todo" }] },
                format: { backgroundColor: { red: 1, green: 0.9, blue: 0.9 }, textFormat: { foregroundColor: { red: 0.5, green: 0, blue: 0 } } },
              },
            },
            index: 1,
          },
        },
        {
          addTable: {
            table: {
              tableId: projectId.replace(/-/g, "").substring(0, 9),
              range: { sheetId: Number(sheetId), startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 10 },
              columnProperties: [
                {
                  columnIndex: 3,
                  columnType: "NUMBER",
                },
                {
                  columnIndex: 5,
                  columnType: "DROPDOWN",
                  dataValidationRule: {
                    condition: {
                      type: "ONE_OF_LIST",
                      values: statusOptions.map(v => ({ userEnteredValue: v }))
                    }
                  }
                },
                {
                  columnIndex: 6,
                  columnType: "DATE",
                },
                {
                  columnIndex: 7,
                  columnType: "DROPDOWN",
                  dataValidationRule: {
                    condition: {
                      type: "ONE_OF_LIST",
                      values: [
                        { userEnteredValue: "low" },
                        { userEnteredValue: "medium" },
                        { userEnteredValue: "high" },
                        { userEnteredValue: "urgent" }
                      ]
                    }
                  }
                }
              ]
            } as any
          }
        }
      ],
    },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheet.data.spreadsheetUrl,
    sheetId,
    tabName: "Sheet1",
  };
}

export async function createWorkspaceSheet(userId: string, workspaceName: string, projects: { id: string, name: string }[], layoutMode: 'single' | 'stacked') {
  const auth = await getGoogleAuth(userId);
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  const resource = {
    properties: {
      title: `Taskboard Workspace: ${workspaceName}`,
    },
  };

  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: resource,
    fields: "spreadsheetId,spreadsheetUrl,sheets",
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Failed to create spreadsheet");

  const results: { projectId: string, sheetId: string, tabName: string }[] = [];
  const defaultSheetId = spreadsheet.data.sheets?.[0]?.properties?.sheetId;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const tabName = p.name.replace(/[\[\]\*\?\/\\]/g, ""); 

    let sheetId: string;
    if (i === 0 && layoutMode === 'stacked') {
      sheetId = String(defaultSheetId);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: Number(sheetId), title: "All Projects" },
              fields: "title"
            }
          }]
        }
      });
    } else {
      const added = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: tabName } }
          }]
        }
      });
      sheetId = String(added.data.replies?.[0]?.addSheet?.properties?.sheetId);
    }

    const headers = [
      "ID (Internal)",
      "Task Name",
      "Description",
      "Progress %",
      "Assignees",
      "Status",
      "Due Date",
      "Priority",
      "Tags",
      "_version",
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${layoutMode === 'stacked' ? 'All Projects' : tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers],
      },
    });

    const columns = await sql<{ name: string }[]>`SELECT name FROM columns WHERE project_id = ${p.id} ORDER BY position`;
    const statusOptions = columns.map(c => c.name);

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: Number(sheetId), gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: Number(sheetId), dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
              properties: { hiddenByUser: true },
              fields: "hiddenByUser",
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: Number(sheetId), dimension: "COLUMNS", startIndex: 9, endIndex: 10 },
              properties: { hiddenByUser: true },
              fields: "hiddenByUser",
            },
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId: Number(sheetId), startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 5, endColumnIndex: 6 }],
                booleanRule: {
                  condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: "todo" }] },
                  format: { backgroundColor: { red: 1, green: 0.9, blue: 0.9 }, textFormat: { foregroundColor: { red: 0.5, green: 0, blue: 0 } } },
                },
              },
              index: 1,
            },
          },
          {
            addTable: {
              table: {
                tableId: p.id.replace(/-/g, "").substring(0, 9),
                range: { sheetId: Number(sheetId), startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 10 },
                columnProperties: [
                  {
                    columnIndex: 3,
                    columnType: "NUMBER",
                  },
                  {
                    columnIndex: 5,
                    columnType: "DROPDOWN",
                    dataValidationRule: {
                      condition: {
                        type: "ONE_OF_LIST",
                        values: statusOptions.map(v => ({ userEnteredValue: v }))
                      }
                    }
                  },
                  {
                    columnIndex: 6,
                    columnType: "DATE",
                  },
                  {
                    columnIndex: 7,
                    columnType: "DROPDOWN",
                    dataValidationRule: {
                      condition: {
                        type: "ONE_OF_LIST",
                        values: [
                          { userEnteredValue: "low" },
                          { userEnteredValue: "medium" },
                          { userEnteredValue: "high" },
                          { userEnteredValue: "urgent" }
                        ]
                      }
                    }
                  }
                ]
              } as any
            }
          }
        ],
      },
    });

    results.push({ projectId: p.id, sheetId, tabName: layoutMode === 'stacked' ? 'All Projects' : tabName });
  }

  if (layoutMode === 'single' && defaultSheetId !== undefined) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: defaultSheetId } }]
        }
      });
    } catch (e) {
      console.warn("Failed to delete default sheet", e);
    }
  }

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheet.data.spreadsheetUrl,
    links: results
  };
}

export async function syncProjectToSheet(userId: string, projectId: string, spreadsheetId: string, tabName: string) {
  const auth = await getGoogleAuth(userId);
  const sheets = google.sheets({ version: "v4", auth: auth as any });

  try {
    await sheets.spreadsheets.get({ spreadsheetId });
  } catch (err: any) {
    if (err.code === 404 || err.code === 403) {
      console.warn(`Spreadsheet ${spreadsheetId} not found or inaccessible.`);
      return;
    }
    throw err;
  }

  const [link] = await sql<ProjectSheetLink[]>`SELECT * FROM project_sheet_links WHERE project_id = ${projectId} AND spreadsheet_id = ${spreadsheetId} AND user_id = ${userId}`;
  if (!link) return;

  const columns = await sql<{ id: string; name: string; is_done: number }[]>`SELECT id, name, is_done FROM columns WHERE project_id = ${projectId} ORDER BY position`;
  if (!columns.length) return;

  const tasks = await sql<any[]>`
    SELECT t.*, u.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.column_id IN ${sql(columns.map((c) => c.id))}
    ORDER BY t.column_id, t.position
  `;

  const taskIds = tasks.map((t) => t.id);
  const assigneeRows = taskIds.length 
    ? await sql<{ task_id: string; name: string }[]>`
        SELECT ta.task_id, u.name FROM task_assignees ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.task_id IN ${sql(taskIds)}
      `
    : [];

  const assigneeMap = new Map<string, string[]>();
  for (const r of assigneeRows) {
    const list = assigneeMap.get(r.task_id) ?? [];
    list.push(r.name);
    assigneeMap.set(r.task_id, list);
  }

  const colMap = new Map(columns.map((c) => [c.id, c.name]));

  const values = tasks.map((t) => {
    const realNames = assigneeMap.get(t.id) ?? [];
    const extNames = JSON.parse(t.external_assignees || "[]") as string[];
    const allNames = [...realNames, ...extNames];

    return [
      t.id,
      t.title,
      t.description,
      t.progress,
      allNames.join(", "),
      colMap.get(t.column_id!) || "",
      t.due_date ? new Date(t.due_date).toISOString().split("T")[0] : "",
      t.priority,
      JSON.parse(t.tags || "[]").join(", "),
      new Date(t.updated_at).getTime(), 
    ];
  });

  if (link.layout_mode === 'stacked') {
    const allLinks = await sql<ProjectSheetLink[]>`SELECT * FROM project_sheet_links WHERE spreadsheet_id = ${spreadsheetId} AND user_id = ${userId} ORDER BY created_at`;
    
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabName}!A2:Z5000`,
    });

    let currentRow = 2;
    for (const l of allLinks) {
      const pTasks = await sql<any[]>`
        SELECT t.* FROM tasks t
        JOIN columns c ON c.id = t.column_id
        WHERE c.project_id = ${l.project_id}
        ORDER BY t.column_id, t.position
      `;
      
      if (pTasks.length === 0) continue;

      const pAssigneeRows = await sql<{ task_id: string; name: string }[]>`
        SELECT ta.task_id, u.name FROM task_assignees ta
        JOIN users u ON u.id = ta.user_id
        WHERE ta.task_id IN ${sql(pTasks.map(t => t.id))}
      `;
      const pAssigneeMap = new Map<string, string[]>();
      for (const r of pAssigneeRows) {
        const list = pAssigneeMap.get(r.task_id) ?? [];
        list.push(r.name);
        pAssigneeMap.set(r.task_id, list);
      }

      const pColumns = await sql<{ id: string; name: string }[]>`SELECT id, name FROM columns WHERE project_id = ${l.project_id}`;
      const pColMap = new Map(pColumns.map(c => [c.id, c.name]));

      const pValues = pTasks.map((t) => {
        const realNames = pAssigneeMap.get(t.id) ?? [];
        const extNames = JSON.parse(t.external_assignees || "[]") as string[];
        const allNames = [...realNames, ...extNames];

        return [
          t.id,
          t.title,
          t.description,
          t.progress,
          allNames.join(", "),
          pColMap.get(t.column_id!) || "",
          t.due_date ? new Date(t.due_date).toISOString().split("T")[0] : "",
          t.priority,
          JSON.parse(t.tags || "[]").join(", "),
          new Date(t.updated_at).getTime(),
        ];
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A${currentRow}`,
        valueInputOption: "RAW",
        requestBody: { values: pValues },
      });
      currentRow += pValues.length;
    }
  } else {
    if (values.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A2`,
        valueInputOption: "RAW",
        requestBody: { values },
      });
    }
    
    const nextRow = values.length + 2;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabName}!A${nextRow}:J2000`,
    });
  }

  await sql`
    UPDATE project_sheet_links 
    SET last_sync_app_to_sheet = CURRENT_TIMESTAMP
    WHERE user_id = ${userId} AND project_id = ${projectId} AND spreadsheet_id = ${spreadsheetId}
  `;
}

const syncDebounceMap = new Map<string, Timer>();

export async function syncProjectToAllLinkedSheets(projectId: string) {
  const existingTimer = syncDebounceMap.get(projectId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    syncDebounceMap.delete(projectId);
    const links = await sql<ProjectSheetLink[]>`SELECT * FROM project_sheet_links WHERE project_id = ${projectId}`;
    for (const link of links) {
      syncProjectToSheet(link.user_id, projectId, link.spreadsheet_id, link.tab_name).catch((err) => {
        console.error(`Background sync failed for project ${projectId}, user ${link.user_id}:`, err);
      });
    }
  }, 2000); 

  syncDebounceMap.set(projectId, timer);
}

export async function syncAllSheetsBackground() {
  const links = await sql<ProjectSheetLink[]>`SELECT * FROM project_sheet_links`;
  for (const link of links) {
    try {
      await syncProjectToSheet(link.user_id, link.project_id, link.spreadsheet_id, link.tab_name);
    } catch (err) {
      console.error(`Background sync failed for link ${link.id}:`, err);
    }
  }
}

export function startSheetSyncInterval() {
  setInterval(syncAllSheetsBackground, 30 * 60 * 1000);
}
