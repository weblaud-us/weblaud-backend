#!/usr/bin/env bash
# One-off verification of the Developer -> PM -> Client update flow against
# the live backend. Not part of the app.
set -e
BASE="http://127.0.0.1:4000/api/v1"

login() {
  curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Demo1234!\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))"
}

# Look up the Acme Website Revamp project id fresh each run (seed script upserts, id is stable but let's not hardcode).
ADMIN_TOKEN=$(login admin@demo.weblaud.local)
PROJECT_ID=$(curl -s "$BASE/client-projects" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.data.find(p=>p.name==='Acme Website Revamp')._id)})")
echo "Project: $PROJECT_ID"

DEV_TOKEN=$(login dev@demo.weblaud.local)
PM_TOKEN=$(login pm@demo.weblaud.local)
CLIENT_TOKEN=$(login client@demo.weblaud.local)

echo ""
echo "--- 1. Developer posts an update (should be pending_review) ---"
UPDATE_RESP=$(curl -s -X POST "$BASE/portal/projects/$PROJECT_ID/updates" \
  -H "Authorization: Bearer $DEV_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Calculator backend wired up","body":"Pricing logic is done, hooking up the UI next.","type":"progress","progressValue":55}')
echo "$UPDATE_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('status:',j.status,'| id:',j._id)})"
UPDATE_ID=$(echo "$UPDATE_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data._id))")

echo ""
echo "--- 2. Client should NOT see it yet (still pending) ---"
curl -s "$BASE/portal/projects/$PROJECT_ID/updates" -H "Authorization: Bearer $CLIENT_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('client sees', j.length, 'update(s):', j.map(u=>u.title).join(', ')||'(none)')})"

echo ""
echo "--- 3. PM's review queue should show it ---"
curl -s "$BASE/portal/updates/review-queue" -H "Authorization: Bearer $PM_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('PM queue:', j.map(u=>u.title).join(', ')||'(none)')})"

echo ""
echo "--- 4. PM approves it ---"
curl -s -X POST "$BASE/portal/updates/$UPDATE_ID/approve" -H "Authorization: Bearer $PM_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('status:',j.status,'publishedAt:',j.publishedAt)})"

echo ""
echo "--- 5. Client should see it now, and project progress should be 55 ---"
curl -s "$BASE/portal/projects/$PROJECT_ID/updates" -H "Authorization: Bearer $CLIENT_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('client sees:', j.map(u=>u.title+' ('+u.status+')').join(', '))})"
curl -s "$BASE/portal/projects/$PROJECT_ID" -H "Authorization: Bearer $CLIENT_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log('project progress:', JSON.parse(d).data.progress))"

echo ""
echo "--- 6. Client requests an update ---"
REQ_RESP=$(curl -s -X POST "$BASE/portal/projects/$PROJECT_ID/update-requests" \
  -H "Authorization: Bearer $CLIENT_TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"Any news on the blog section?"}')
echo "$REQ_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('status:',j.status,'| id:',j._id)})"
REQUEST_ID=$(echo "$REQ_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data._id))")

echo ""
echo "--- 7. PM sees the open request and closes (answers) it ---"
curl -s "$BASE/portal/projects/$PROJECT_ID/update-requests" -H "Authorization: Bearer $PM_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('PM sees:', j.map(r=>r.message+' ('+r.status+')').join(', '))})"
curl -s -X POST "$BASE/portal/update-requests/$REQUEST_ID/close" -H "Authorization: Bearer $PM_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('after close -> status:',j.status)})"

echo ""
echo "--- 8. Now test a REJECT: dev posts another update, PM rejects it ---"
UPDATE2_RESP=$(curl -s -X POST "$BASE/portal/projects/$PROJECT_ID/updates" \
  -H "Authorization: Bearer $DEV_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Blog section done","body":"Shipped it.","type":"progress"}')
UPDATE2_ID=$(echo "$UPDATE2_RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data._id))")
curl -s -X POST "$BASE/portal/updates/$UPDATE2_ID/reject" \
  -H "Authorization: Bearer $PM_TOKEN" -H "Content-Type: application/json" \
  -d '{"reviewNote":"Please add screenshots before this goes out."}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('status:',j.status,'| note:',j.reviewNote)})"
echo ""
echo "--- Client must NOT see the rejected update ---"
curl -s "$BASE/portal/projects/$PROJECT_ID/updates" -H "Authorization: Bearer $CLIENT_TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('client sees', j.length, 'update(s) total:', j.map(u=>u.title).join(', '))})"

echo ""
echo "--- 9. Dev resubmits the rejected update ---"
curl -s -X PATCH "$BASE/portal/updates/$UPDATE2_ID" \
  -H "Authorization: Bearer $DEV_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Blog section done","body":"Shipped it, with screenshots attached in the description."}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d).data;console.log('status after resubmit:',j.status)})"

echo ""
echo "--- 10. Security check: client2 (Globex) must NOT be able to see or post to Acme's project ---"
CLIENT2_TOKEN=$(login client2@demo.weblaud.local)
curl -s -o /dev/null -w "GET updates as client2 (wrong org) -> HTTP %{http_code}\n" \
  "$BASE/portal/projects/$PROJECT_ID/updates" -H "Authorization: Bearer $CLIENT2_TOKEN"
curl -s -o /dev/null -w "POST update-request as client2 (wrong org) -> HTTP %{http_code}\n" \
  -X POST "$BASE/portal/projects/$PROJECT_ID/update-requests" \
  -H "Authorization: Bearer $CLIENT2_TOKEN" -H "Content-Type: application/json" -d '{"message":"hi"}'

echo ""
echo "--- 11. Security check: unassigned staff must NOT be able to post an update to Acme's project ---"
UNASSIGNED_TOKEN=$(login unassigned@demo.weblaud.local)
curl -s -o /dev/null -w "POST update as unassigned staff -> HTTP %{http_code}\n" \
  -X POST "$BASE/portal/projects/$PROJECT_ID/updates" \
  -H "Authorization: Bearer $UNASSIGNED_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"x","body":"y"}'
