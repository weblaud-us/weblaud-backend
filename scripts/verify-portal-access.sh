#!/usr/bin/env bash
# One-off verification: logs in as every demo account and checks the
# projects endpoint returns exactly what each role should see. Not part of
# the app — just a throwaway check run once after seeding.
set -e
BASE="http://127.0.0.1:4000/api/v1"

login() {
  curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Demo1234!\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))"
}

projects_for() {
  local token
  token=$(login "$1")
  curl -s "$BASE/portal/projects" -H "Authorization: Bearer $token" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.data.map(p=>p.name).join(', ') || '(none)')})"
}

echo "admin@demo.weblaud.local        -> $(projects_for admin@demo.weblaud.local)"
echo "pm@demo.weblaud.local           -> $(projects_for pm@demo.weblaud.local)"
echo "dev@demo.weblaud.local          -> $(projects_for dev@demo.weblaud.local)"
echo "unassigned@demo.weblaud.local   -> $(projects_for unassigned@demo.weblaud.local)"
echo "client@demo.weblaud.local       -> $(projects_for client@demo.weblaud.local)"
echo "viewer@demo.weblaud.local       -> $(projects_for viewer@demo.weblaud.local)"
echo "client2@demo.weblaud.local      -> $(projects_for client2@demo.weblaud.local)"
