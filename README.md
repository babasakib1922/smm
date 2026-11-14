# Nexus SMM Automation & Scheduling Panel

Enterprise SMM Panel built with high-performance Node.js, SQLite with ACID transactions, Glassmorphic UI/UX, and an exact mathematical drip-feed Campaign Scheduler.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js v18+ (Node.js v20 LTS included/installed)

### 2. Start the Server
```bash
npm start
```
The server will boot on `http://localhost:3000`.

### 3. Default Access Pass Keys
| Role | Username | Access Pass Key | Permissions | Initial Balance |
| :--- | :--- | :--- | :--- | :--- |
| **Protected ADMIN** | `admin` (or `sakib`) | `sakib1922` | Full panel access, Admin Settings, User Management, Service Manager | $1,000.00 |
| **USER** | `client_demo` | `user12345pass` | Dashboard, Orders, Scheduler, Engagement, APIs, Analytics | $250.00 |

> **Note:** Public registration is disabled. Only authorized users with a valid access pass key can log in.

---

## 🛠️ Verification & Test Suite

Run the master automated test suite verifying all 24 specifications:
```bash
npm test
```

Run end-to-end HTTP REST API tests:
```bash
npm run test:http
```

---

## 📋 Comprehensive Feature Implementation (All 24 Sections)

### 1. Private Login System
- No public sign up page.
- Login requires a private access pass key verified with `bcryptjs`.
- Session token management (JWT + DB-backed sessions).
- Instant access revocation: disabled or deleted users lose access immediately on every request.

### 2. User Roles & Permissions
- Strict backend role enforcement (`ADMIN` and `USER`).
- Complete user data isolation: standard users cannot view or access another user's orders, credentials, or balances.

### 3. Admin Account Protection
- **Immunity Rules Enforced:**
  - An `ADMIN` cannot be deleted by another `ADMIN`.
  - An `ADMIN` cannot be disabled by another `ADMIN`.
  - An `ADMIN` cannot be downgraded to `USER` by another `ADMIN`.
  - Final active `ADMIN` account cannot be removed.
- All administrative operations are logged to the `audit_logs` table.

### 4. User Management (ADMIN Only)
- View all registered users with search, role filters, and status filters.
- View individual profiles with real balance, order history, and API configurations.
- Enable/disable user accounts with immediate session revocation.
- Soft delete / anonymize user accounts while preserving financial audit records.
- Adjust user balance with atomic balance ledger transactions.

### 5. Multiple API Configurations
- Support for multiple API providers (Zeofame, Xmedia, Mock/Sandbox).
- **AES-256-GCM Encryption:** User API keys are encrypted at rest with unique initialization vectors (`iv`) and authentication tags (`auth_tag`).
- Full API keys are never exposed in frontend responses (masked as `sk_...abcd`).
- Live connection test with provider balance reporting.

### 6. Service Manager (ADMIN Only)
- Add, edit, archive, and delete delivery services.
- Configure provider service ID, category, min/max limits, rate per 1,000, and descriptions.
- Assign services to specific users or public availability.

### 7. Create Order System
- Live URL format validation and service limits checking.
- Instant price calculation.
- Transaction-safe balance deductions (`tx.run('UPDATE users SET balance = ...')`).
- Duplicate submission & idempotency protection preventing double charges.
- Order confirmation review modal.

### 8. Campaign Scheduler & Package Batch Planner
Exact mathematical formula implementation:
$$\text{Batch Time} = \text{Campaign Start Time} + ((\text{Batch Number} - 1) \times \text{Interval})$$

#### Package Configurations Table
| Package | Total Volume | Total Batches | Interval | Campaign Window | Final Batch Relative Time | Remaining Buffer |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **2K Views** | 2,000 | 16 | 20 mins | 5 hours | +300 mins (5h 00m) | **0 mins** |
| **5K Views** | 5,000 | 20 | 45 mins | 16 hours | +855 mins (14h 15m) | **105 mins (1h 45m)** |
| **10K Views** | 10,000 | 26 | 48 mins | 22 hours | +1,200 mins (20h 00m) | **120 mins (2h 00m)** |
| **50K Views** | 50,000 | 44 | 62 mins | 48 hours | +2,666 mins (44h 26m) | **214 mins (3h 34m)** |

- **Buffer Analysis:** The remaining buffer between final planned batch and campaign window is explicitly calculated and displayed.
- **Quantity Distribution:** Integers distributed across batches with exact sum preservation.
- **Shuffle Plan:** Generates alternative quantity allocations with natural variance without altering intervals or windows.
- **Controls:** Save Plan, Share Plan (read-only link), Copy Schedule, and Export CSV.

### 9. Advanced Scheduling
- User timezone detection and display.
- Batch timestamps stored in UTC and rendered in the user's local timezone.
- Pause, Resume, and Cancel campaign controls.

### 10 & 11. Automation Engine & Duplicate Execution Protection
- **Worker A (Campaign Worker):** Evaluates due scheduled campaigns, verifies user status and balances, transitions campaigns from `Scheduled` to `Running`, and marks finished campaigns as `Completed`.
- **Worker B (Batch Processing Worker):** Detects due batches, enforces atomic locking (`UPDATE campaign_batches SET status = 'Processing', execution_id = ? WHERE id = ? AND status = 'Scheduled'`), preventing duplicate worker execution.
- Dispatches orders with idempotency keys.
- Automatic retries with backoff and retry limits.
- Background status synchronizer syncing order statuses with provider APIs.

### 12. API Adapters & Error Handling
- Standard SMM v2 API Adapter (`action=add`, `action=status`, `action=balance`, `action=services`).
- Mock Provider Adapter for fast offline testing.
- Timeout handling (15-second AbortController) and secret redaction in logs.

### 13. Order History
- Search by Order ID, URL, or Service.
- Filter by status and date range.
- Order details modal.

### 14. Analytics Dashboard
- User Dashboard: Active orders, completed orders, failed orders, spending, balance, and Chart.js graphs.
- Admin Dashboard: Platform users, total balances, active campaigns, provider statuses, and system audit logs.

### 15. CSV Import
- Upload CSV file with drag & drop support.
- Row-by-row validation (URL, service, limits, and duplicate row detection).
- Financial feasibility check against user balance.
- Confirmation step before execution.

### 16. CSV & Excel Export
- Order history, campaign batch schedules, and financial transactions exportable to CSV.
- Encoded with UTF-8 BOM (`\uFEFF`) for immediate compatibility with Microsoft Excel.

### 17. In-Panel Notification System
- Real-time alerts for orders created, submitted, completed, and failed.
- Campaign scheduled, started, and batch delivery milestones.
- Unread notification badge counter and mark-as-read functionality.

### 18. Engagement Command Center
- Dedicated tab independent from the normal order page.
- Direct connection status for Views provider (**Xmedia**, Service ID `10322`) and Likes provider (**Zeofame**, Service ID `1123`).
- Action prompts asking user to connect credentials if disconnected.
- Live delivery telemetry bar chart.

### 19. Admin Settings & System Parameters
- Manage package parameters (batch counts, intervals, windows, prices) dynamically without code recompilation.
- View worker execution logs and administrative audit trail.

---

## 🔒 Security Architecture
- Passwords & Pass Keys: Hashed using `bcryptjs` with salt rounds.
- Credentials: API keys encrypted with AES-256-GCM.
- SQL Injection Prevention: Parameterized prepared statements.
- Session Hijacking Defense: HTTP-only cookies and cryptographic JWT verification.
- Rate Limiting: 200 requests/minute per client IP.

