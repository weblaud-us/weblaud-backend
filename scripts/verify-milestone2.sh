#!/usr/bin/env bash
# One-off live verification of Milestone 2 (contracts, change requests,
# approvals, invoices, Stripe-unconfigured behavior) against the demo data
# from seed-portal-demo.ts. Not part of the app — a throwaway smoke test.
set -e
BASE="http://127.0.0.1:4000/api/v1"
PASS="Demo1234!"

login() {
  curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))"
}

jget() {
  # jget <json-on-stdin> <dotted.path>
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const path=process.argv[1].split('.');let v=j;for(const k of path){v=v?.[k]}console.log(v)})" "$1"
}

echo "== Logging in =="
ADMIN=$(login admin@demo.weblaud.local)
sleep 1
PM=$(login pm@demo.weblaud.local)
sleep 1
CLIENT=$(login client@demo.weblaud.local)
echo "tokens ok: admin=${#ADMIN} pm=${#PM} client=${#CLIENT}"

echo ""
echo "== Resolving demo ids =="
ORGS=$(curl -s "$BASE/organizations" -H "Authorization: Bearer $ADMIN")
ACME_ORG=$(echo "$ORGS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.find(o=>o.name==='Acme Inc')._id))")
PROJECTS=$(curl -s "$BASE/client-projects" -H "Authorization: Bearer $ADMIN")
ACME_PROJECT=$(echo "$PROJECTS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.find(p=>p.name==='Acme Website Revamp')._id))")
echo "Acme org: $ACME_ORG | Acme project: $ACME_PROJECT"

echo ""
echo "== Baseline project budget =="
BEFORE=$(curl -s "$BASE/client-projects/$ACME_PROJECT" -H "Authorization: Bearer $ADMIN")
echo "$BEFORE" | jget "data.budget"

echo ""
echo "== CONTRACT: create (draft, no doc) =="
TESTFILE="$SCRATCH_DIR/test-contract.pdf"
echo "test contract content" > "$TESTFILE"
CONTRACT=$(curl -s -X POST "$BASE/contracts" -H "Authorization: Bearer $ADMIN" \
  -F "organization=$ACME_ORG" -F "title=Master Service Agreement" \
  -F "document=@$TESTFILE;type=application/pdf")
CONTRACT_ID=$(echo "$CONTRACT" | jget "data._id")
echo "created: $CONTRACT_ID, status=$(echo "$CONTRACT" | jget data.status), doc=$(echo "$CONTRACT" | jget data.documentUrl)"

echo "-- send --"
SENT=$(curl -s -X POST "$BASE/contracts/$CONTRACT_ID/send" -H "Authorization: Bearer $ADMIN")
echo "status=$(echo "$SENT" | jget data.status)"

echo "-- client accepts --"
ACCEPTED=$(curl -s -X POST "$BASE/portal/contracts/$CONTRACT_ID/accept" -H "Authorization: Bearer $CLIENT" \
  -H "Content-Type: application/json" -d '{"name":"Alex Client"}')
echo "status=$(echo "$ACCEPTED" | jget data.status), acceptedBy=$(echo "$ACCEPTED" | jget data.acceptance.name)"

echo "-- certificate PDF fetch (expect application/pdf) --"
curl -s -o /dev/null -w "certificate content-type: %{content_type}, http: %{http_code}\n" \
  "$BASE/portal/contracts/$CONTRACT_ID/certificate.pdf" -H "Authorization: Bearer $CLIENT"

echo ""
echo "== CHANGE REQUEST: PM creates, client approves =="
CR=$(curl -s -X POST "$BASE/portal/projects/$ACME_PROJECT/change-requests" -H "Authorization: Bearer $PM" \
  -H "Content-Type: application/json" -d '{"title":"Add live chat widget","priceAmount":1500,"currency":"USD"}')
CR_ID=$(echo "$CR" | jget "data._id")
echo "created: $CR_ID status=$(echo "$CR" | jget data.status)"

APPROVED_CR=$(curl -s -X POST "$BASE/portal/change-requests/$CR_ID/approve" -H "Authorization: Bearer $CLIENT")
echo "status=$(echo "$APPROVED_CR" | jget data.status)"

echo "-- project budget after change-request approval (amount should be +1500) --"
AFTER_CR=$(curl -s "$BASE/client-projects/$ACME_PROJECT" -H "Authorization: Bearer $ADMIN")
echo "$AFTER_CR" | jget "data.budget"

echo ""
echo "== APPROVAL (deliverable sign-off): PM requests, client approves =="
APR=$(curl -s -X POST "$BASE/portal/projects/$ACME_PROJECT/approvals" -H "Authorization: Bearer $PM" \
  -H "Content-Type: application/json" -d '{"subjectType":"deliverable","title":"Homepage design v2"}')
APR_ID=$(echo "$APR" | jget "data._id")
echo "created: $APR_ID status=$(echo "$APR" | jget data.status)"

APR_DECIDED=$(curl -s -X POST "$BASE/portal/approvals/$APR_ID/approve" -H "Authorization: Bearer $CLIENT" \
  -H "Content-Type: application/json" -d '{"comment":"Looks great"}')
echo "status=$(echo "$APR_DECIDED" | jget data.status)"

echo ""
echo "== INVOICE: admin creates, sends, marks paid =="
INV=$(curl -s -X POST "$BASE/invoices" -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" -d "{
  \"organization\":\"$ACME_ORG\",\"project\":\"$ACME_PROJECT\",\"type\":\"milestone\",
  \"lineItems\":[{\"description\":\"Design phase\",\"qty\":1,\"unitPrice\":2000}],
  \"tax\":0,\"currency\":\"USD\",
  \"issueDate\":\"2026-08-01\",\"dueDate\":\"2026-08-15\"
}")
INV_ID=$(echo "$INV" | jget "data._id")
echo "created: $INV_ID number=$(echo "$INV" | jget data.number) total=$(echo "$INV" | jget data.total) status=$(echo "$INV" | jget data.status)"

curl -s -X POST "$BASE/invoices/$INV_ID/send" -H "Authorization: Bearer $ADMIN" > /dev/null
echo "-- sent --"

echo "-- Stripe checkout attempt (expect graceful 400, not 500) --"
curl -s -o /dev/null -w "checkout http: %{http_code}\n" -X POST "$BASE/portal/invoices/$INV_ID/checkout" \
  -H "Authorization: Bearer $CLIENT"
curl -s -X POST "$BASE/portal/invoices/$INV_ID/checkout" -H "Authorization: Bearer $CLIENT" | jget "message"

echo "-- admin marks paid manually --"
PAID=$(curl -s -X POST "$BASE/invoices/$INV_ID/mark-paid" -H "Authorization: Bearer $ADMIN")
echo "status=$(echo "$PAID" | jget data.status) paidAt=$(echo "$PAID" | jget data.paidAt)"

echo "-- invoice PDF fetch --"
curl -s -o /dev/null -w "invoice pdf content-type: %{content_type}, http: %{http_code}\n" \
  "$BASE/portal/invoices/$INV_ID/pdf" -H "Authorization: Bearer $CLIENT"

echo ""
echo "== Final project budget (amount +1500 from CR, spent +2000 from invoice) =="
FINAL=$(curl -s "$BASE/client-projects/$ACME_PROJECT" -H "Authorization: Bearer $ADMIN")
echo "$FINAL" | jget "data.budget"

echo ""
echo "== Cross-org isolation: Globex client must NOT see Acme's contract/invoice =="
sleep 8
CLIENT2=$(login client2@demo.weblaud.local)
curl -s -o /dev/null -w "Globex client -> Acme contract: http %{http_code} (expect 403 or 404)\n" \
  "$BASE/portal/contracts/$CONTRACT_ID" -H "Authorization: Bearer $CLIENT2"
curl -s -o /dev/null -w "Globex client -> Acme invoice:  http %{http_code} (expect 403 or 404)\n" \
  "$BASE/portal/invoices/$INV_ID" -H "Authorization: Bearer $CLIENT2"

echo ""
echo "== Done =="
