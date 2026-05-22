const url = "https://lsdrvovwybzspcvbdcir.supabase.co/rest/v1/";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzZHJ2b3Z3eWJ6c3BjdmJkY2lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTUyMjMsImV4cCI6MjA5MjI5MTIyM30.p7kJv9cE9z9KVuibviqVxWcsHOM596yb8iNLiRkKFy8";

async function main() {
  const res = await fetch(url, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body preview:", text.substring(0, 500));
}

main().catch(console.error);
