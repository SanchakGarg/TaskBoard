import { sql } from './src/db.ts';
import jwt from 'jsonwebtoken';

async function test() {
  const [task] = await sql`SELECT t.id, t.column_id FROM tasks t JOIN columns c ON c.id = t.column_id WHERE c.project_id IS NOT NULL LIMIT 1`;
  if (!task) {
    console.log('no task');
    process.exit(0);
  }
  console.log('Task', task);
  const token = jwt.sign({id:1,email:'sanchakgargss@gmail.com',name:'Sanchak'}, process.env.JWT_SECRET || 'test');
  const res = await fetch('http://localhost:3000/api/tasks/' + task.id + '/move', {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId: task.column_id, position: 0 })
  });
  console.log(await res.text());
  process.exit(0);
}
test();
