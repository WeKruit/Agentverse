# Production Deployment Checklist

Everything needed to go from local development to production deployment.

## What's Running Locally (substitutes)

| Local Substitute | Production Replacement | Why |
|-----------------|----------------------|-----|
| In-memory Maps for buckets/listings/proposals | PostgreSQL + pgvector | Data survives restarts |
| `SimulatedTeeVenue` (matching in-process) | AWS Nitro Enclave (matching in hardware TEE) | Raw data never leaves cryptographic control |
| Hash-based embeddings (`embeddings.ts`) | sentence-transformers all-MiniLM-L6-v2 | Real semantic similarity, not keyword overlap |
| `localhost:3000` Express server | EC2 behind ALB with TLS certificate | Internet-accessible, encrypted transport |
| Hardcoded dev passphrase | OS keychain (macOS Keychain / libsecret) | Real credential protection |
| `did:key:` (ephemeral) | `did:webvh:` (persistent, DNS-anchored) | Resolvable by anyone on the internet |
| File-based audit log (JSONL) | Tessera transparency log | Public verifiability, tamper evidence |
| No rate limiting on API | Per-IP + per-DID rate limiting | Abuse prevention |

---

## Infrastructure Setup

### 1. AWS Account + Nitro Enclave

```bash
# EC2 instance with enclave support
aws ec2 run-instances \
  --instance-type m5.xlarge \
  --enclave-options 'Enabled=true' \
  --image-id ami-0abcdef1234567890  # Amazon Linux 2

# Install Nitro CLI
sudo amazon-linux-extras install aws-nitro-enclaves-cli
sudo systemctl enable nitro-enclaves-allocator
```

**Tasks:**
- [ ] Create AWS account with billing
- [ ] Set up IAM roles (EC2, KMS, CloudWatch)
- [ ] Launch m5.xlarge with enclave enabled
- [ ] Configure security groups (port 443 inbound, all outbound)
- [ ] Allocate Elastic IP

**Estimated cost:** ~$140/month

### 2. KMS Key for Enclave Attestation

```bash
# Create KMS key with enclave policy
aws kms create-key \
  --description "Agentverse TEE attestation key" \
  --key-usage ENCRYPT_DECRYPT

# Set key policy to only allow decryption from attested enclaves
# PCR0 = enclave image hash, PCR3 = IAM role, PCR8 = enclave signing cert
```

**Tasks:**
- [ ] Create KMS key
- [ ] Configure key policy with PCR attestation conditions
- [ ] Test key release from inside enclave
- [ ] Set up key rotation schedule

**Estimated cost:** ~$1/month

### 3. PostgreSQL Database

```bash
# RDS PostgreSQL with pgvector extension
aws rds create-db-instance \
  --db-instance-identifier agentverse-db \
  --engine postgres \
  --engine-version 16 \
  --db-instance-class db.t3.medium \
  --allocated-storage 20
```

**Schema needed:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  schema_fields TEXT[] NOT NULL,
  status TEXT DEFAULT 'active',
  agent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  bucket_id TEXT REFERENCES buckets(id),
  owner_did TEXT NOT NULL,
  structured JSONB NOT NULL,
  evaluable_text JSONB,
  embedding vector(384),
  dealbreakers JSONB,
  status TEXT DEFAULT 'active',
  commitment_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_listings_bucket ON listings(bucket_id, status);
CREATE INDEX idx_listings_embedding ON listings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  bucket_id TEXT,
  listing_a_id TEXT REFERENCES listings(id),
  listing_b_id TEXT REFERENCES listings(id),
  signal TEXT,
  matched_on TEXT[],
  gaps TEXT[],
  score REAL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE audit_log (
  seq SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  agent_domain TEXT,
  agent_did TEXT,
  purpose TEXT,
  attributes_disclosed TEXT[],
  status TEXT,
  vp_hash TEXT,
  prev_hash TEXT,
  hash TEXT
);
```

**Tasks:**
- [ ] Create RDS instance
- [ ] Enable pgvector extension
- [ ] Run schema migration
- [ ] Configure connection pooling (pgBouncer)
- [ ] Set up automated backups
- [ ] Test from EC2 instance

**Estimated cost:** ~$50/month

### 4. Domain + TLS

**Tasks:**
- [ ] Register domain (e.g., agentverse.app)
- [ ] Set up Route 53 hosted zone
- [ ] Request ACM certificate (wildcard *.agentverse.app)
- [ ] Configure ALB with HTTPS listener
- [ ] Set up DNS records:
  - `agentverse.app` → ALB
  - `api.agentverse.app` → ALB
  - Users serve their own Agent Cards at `<username>.agentverse.app`

**Estimated cost:** ~$15/year (domain) + ~$2/month (Route 53)

### 5. Embedding Service

**Tasks:**
- [ ] Deploy sentence-transformers model (all-MiniLM-L6-v2)
- [ ] Option A: Sidecar container on the EC2 instance
- [ ] Option B: SageMaker serverless endpoint
- [ ] Option C: Use an embedding API (OpenAI, Cohere, Voyage)
- [ ] API: `POST /embed { text: "..." } → { embedding: [384 floats] }`
- [ ] Cache embeddings in PostgreSQL (don't re-compute for unchanged profiles)

**Estimated cost:** ~$0-50/month depending on approach

### 6. Monitoring + Observability

**Tasks:**
- [ ] CloudWatch logs for API server
- [ ] CloudWatch metrics: request latency, error rate, match count
- [ ] Alarms: error rate > 5%, p99 latency > 5s, enclave health
- [ ] Dashboard: bucket stats, active listings, match rate

**Estimated cost:** ~$10/month

---

## Code Changes for Production

### Rust Enclave

The matching engine needs to be ported from TypeScript to Rust for the Nitro Enclave:

- [ ] Port `matching-engine.ts` → Rust (`matching-engine/src/lib.rs`)
- [ ] Port `bucket-registry.ts` → Rust with PostgreSQL backend
- [ ] Implement vsock communication (enclave ↔ host)
- [ ] Build EIF (Enclave Image File) with Nitro CLI
- [ ] Implement remote attestation verification
- [ ] Test matching inside enclave produces same results as TypeScript version

### Database Migration

Replace in-memory Maps with PostgreSQL queries:

- [ ] `bucket-registry.ts`: Map operations → SQL queries
- [ ] `match-protocol.ts`: Proposal storage → SQL
- [ ] `audit.ts`: JSONL file → audit_log table
- [ ] Connection pooling with `pg` or `postgres` npm package
- [ ] Migration scripts (up/down)

### Identity Evolution

- [ ] `did:key` → `did:webvh` (requires hosting DID Document at a resolvable URL)
- [ ] `alsoKnownAs` linking between old and new DID
- [ ] Re-issue VCs under new DID
- [ ] JWS signature on Agent Card (currently validation-only)

### Security Hardening

- [ ] Interactive passphrase prompt (replace hardcoded "agentverse-dev")
- [ ] OS keychain integration (macOS Keychain, Linux secret-service)
- [ ] Profile encryption at rest (currently plaintext profile.json)
- [ ] Rate limiting on all API endpoints
- [ ] CORS configuration
- [ ] Helmet.js security headers
- [ ] Input size limits on all endpoints
- [ ] DDoS protection (WAF or CloudFront)

### npm Package

- [ ] `package.json` `bin` field configured
- [ ] `npm publish` to registry
- [ ] `npx agentverse init` works
- [ ] Homebrew formula (optional)
- [ ] Test on macOS, Linux, Windows (WSL)

---

## Launch Checklist

### Pre-Launch (Day of)

- [ ] All production infrastructure running
- [ ] Smoke test: init → extract → issue → share → verify on production
- [ ] Agent Card accessible at `https://agentverse.app/.well-known/agent.json`
- [ ] npm package published
- [ ] README finalized with quickstart
- [ ] Demo video recorded (3-minute extract → share → verify)
- [ ] AI Profile Card generator working

### Launch Day

- [ ] Show HN post drafted and submitted
- [ ] Twitter/X thread with AI Profile Card ready
- [ ] Monitor: npm installs, GitHub stars, error rates
- [ ] Respond to HN comments and GitHub issues

### Post-Launch (Week 1)

- [ ] Triage bug reports
- [ ] Track funnel: install → extract → issue → share
- [ ] Collect user feedback
- [ ] Fix top 3 friction points
- [ ] Blog post: "How we built Agentverse" (architecture deep dive)

---

## Cost Summary

| Component | Monthly | Annual |
|-----------|---------|--------|
| EC2 m5.xlarge (Nitro) | $140 | $1,680 |
| RDS PostgreSQL | $50 | $600 |
| Domain + DNS | $2 | $39 |
| CloudWatch | $10 | $120 |
| KMS | $1 | $12 |
| Embedding service | $0-50 | $0-600 |
| **Total** | **$203-253** | **$2,451-3,051** |
