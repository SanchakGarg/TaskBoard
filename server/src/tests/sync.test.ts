import { sql } from "../db";

async function testTaskProgress() {
  console.log("Testing Task Progress Clamping...");
  
  // Create a dummy user and project/column if needed
  const [user] = await sql`INSERT INTO users (provider, subject, email, name) VALUES ('test', 'sub1', 'test@example.com', 'Test User') RETURNING id`;
  const [project] = await sql`INSERT INTO projects (workspace_id, name, created_by) VALUES (gen_random_uuid(), 'Test Project', ${user.id}) RETURNING id`;
  const [column] = await sql`INSERT INTO columns (project_id, name, position) VALUES (${project.id}, 'Test Col', 0) RETURNING id`;

  // Test 1: Negative progress
  try {
    await sql`INSERT INTO tasks (column_id, title, progress, created_by) VALUES (${column.id}, 'Neg Test', -10, ${user.id})`;
    console.error("❌ FAILED: Allowed negative progress");
  } catch (e) {
    console.log("✅ PASSED: Blocked negative progress");
  }

  // Test 2: Over 100 progress
  try {
    await sql`INSERT INTO tasks (column_id, title, progress, created_by) VALUES (${column.id}, 'Over Test', 110, ${user.id})`;
    console.error("❌ FAILED: Allowed progress > 100");
  } catch (e) {
    console.log("✅ PASSED: Blocked progress > 100");
  }

  // Test 3: Valid progress
  try {
    const [task] = await sql`INSERT INTO tasks (column_id, title, progress, created_by) VALUES (${column.id}, 'Valid Test', 50, ${user.id}) RETURNING progress`;
    if (task.progress === 50) console.log("✅ PASSED: Allowed valid progress (50)");
    else console.error(`❌ FAILED: Progress value mismatch (${task.progress})`);
  } catch (e) {
    console.error("❌ FAILED: Error during valid progress insert", e);
  }

  // Cleanup
  await sql`DELETE FROM users WHERE id = ${user.id}`;
  await sql`DELETE FROM projects WHERE id = ${project.id}`;
}

testTaskProgress().then(() => {
  console.log("Tests finished.");
  process.exit(0);
}).catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
