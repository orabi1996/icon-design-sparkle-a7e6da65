const SUPABASE_URL = "https://ufdfvcsvvgzjxsmekqqc.supabase.co";
const SUPABASE_KEY = "sb_publishable_SFJbLeGyqW0zWNo_w8Vr9A_aNkRUhK8";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function testRpc() {
  console.log("Checking available RPCs or endpoints on", SUPABASE_URL);

  // Check OpenAPI spec from PostgREST root
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
    console.log("PostgREST root status:", res.status);
    if (res.ok) {
      const spec = await res.json();
      console.log("OpenAPI definitions count:", Object.keys(spec.definitions || {}).length);
      console.log("OpenAPI paths count:", Object.keys(spec.paths || {}).length);
      const rpcPaths = Object.keys(spec.paths || {}).filter(p => p.startsWith("/rpc/"));
      console.log("Available RPC paths:", rpcPaths);
      console.log("Sample tables:", Object.keys(spec.definitions || {}).slice(0, 15));
    } else {
      console.log("PostgREST root error:", await res.text());
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

testRpc().catch(console.error);
