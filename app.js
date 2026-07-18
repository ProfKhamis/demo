const BASE_URL = 'https://api.derivws.com';
let accountList = [];
let optionsWebSocket = null;
let totalSessionProfit = 0;
const sessionProfitDisplay = document.getElementById("session-profit-display"); 
let activeTabId = 'tab-even-odd';
let isAutoTradingEO = false;
let isAutoTradingOU = false;
let autoBulkCooldown = false; 
let totalTradesExecutedOU = 0; 

// DOM Bindings - Core & UI elements
const btnFetch = document.getElementById('btn-fetch-accounts');
const btnResetBalance = document.getElementById('btn-reset-balance');
const btnToggleStream = document.getElementById('btn-toggle-stream');
const tokenInput = document.getElementById('api-token');
const appIdInput = document.getElementById('app-id');
const apiStatus = document.getElementById('api-status');
const dropdown = document.getElementById('account-dropdown');
const balanceText = document.getElementById('active-balance');
const currencyText = document.getElementById('active-currency');
const badge = document.getElementById('account-type-badge');
const logConsole = document.getElementById('log-console');

// DOM Bindings - Market Data
const marketPanel = document.getElementById('market-data-panel');
const marketDropdown = document.getElementById('market-dropdown');
const liveTickValue = document.getElementById('live-tick-value');
const liveDigitValue = document.getElementById('live-digit-value');

// DOM Bindings - Strategy 1 (EO)
const btnBuyEO = document.getElementById('btn-buy-eo');
const btnToggleAutoEO = document.getElementById('btn-toggle-auto-eo');
const tradeStakeEO = document.getElementById('trade-stake-eo');
const tradeDurationEO = document.getElementById('trade-duration-eo');
const strategyModeEO = document.getElementById('strategy-mode-eo');
const tradeStakeBEO = document.getElementById("trade-stake-beo");
const tradeDurationBEO = document.getElementById("trade-duration-beo");
const btnBuyBEO = document.getElementById("btn-buy-beo");
const maxTradesBEO = document.getElementById("max-trades-beo");
let totalTradesExecutedBEO = 0;
const btnToggleAutoBEO = document.getElementById("btn-toggle-auto-beo");
let isAutoModeBEO = false;
let trackingSettledContractsBEO = 0;

// DOM Bindings - Strategy 2 (OU)
const btnBuyOU = document.getElementById('btn-buy-ou');
const btnToggleAutoOU = document.getElementById('btn-toggle-auto-ou');
const tradeStakeOU = document.getElementById('trade-stake-ou');
const tradeDurationOU = document.getElementById('trade-duration-ou');
const predOverInput = document.getElementById('pred-over');
const predUnderInput = document.getElementById('pred-under');
const maxTradesOUInput = document.getElementById('max-trades-ou');
const ledgerBody = document.getElementById('ledger-body');
const emptyRow = document.getElementById('ledger-empty-row');

// DOM Bindings - Strategy 5 (Pattern-Triggered Over/Under)
const btnToggleAutoPOU = document.getElementById('btn-toggle-auto-pou');
const tradeStakePOU = document.getElementById('trade-stake-pou');
const tradeDurationPOU = document.getElementById('trade-duration-pou');
const maxTradesPOUInput = document.getElementById('max-trades-pou');
const patternDigitHistoryDisplay = document.getElementById('pattern-digit-history');
const patternLastMatchDisplay = document.getElementById('pattern-last-match');

// DOM Bindings - Take Profit / Stop Loss
const btnToggleTPSL = document.getElementById('btn-toggle-tpsl');
const tpTargetInput = document.getElementById('tp-target');
const slTargetInput = document.getElementById('sl-target');
const tpslProgressFill = document.getElementById('tpsl-progress-fill');
const tpslModalOverlay = document.getElementById('tpsl-modal-overlay');
const tpslModalIcon = document.getElementById('tpsl-modal-icon');
const tpslModalTitle = document.getElementById('tpsl-modal-title');
const tpslModalMessage = document.getElementById('tpsl-modal-message');
const tpslModalAmount = document.getElementById('tpsl-modal-amount');
const btnCloseTPSLModal = document.getElementById('btn-close-tpsl-modal');
let isTPSLArmed = false;

// DOM Bindings - Bulk Over 2 (digit-trigger batch buyer)
const btnBuyBulkOver2 = document.getElementById('btn-buy-bulk-over2');
const tradeStakeOver2 = document.getElementById('trade-stake-over2');
const tradeDurationOver2 = document.getElementById('trade-duration-over2');
const triggerModeOver2Select = document.getElementById('trigger-mode-over2');
const triggerDigitOver2Input = document.getElementById('trigger-digit-over2');
const triggerDigitLabelOver2 = document.getElementById('trigger-digit-label-over2');
const triggerDigit2Over2Input = document.getElementById('trigger-digit-2-over2');
const triggerDigit2WrapperOver2 = document.getElementById('trigger-digit-2-wrapper-over2');
const contractsPerTriggerOver2Input = document.getElementById('contracts-per-trigger-over2');
const maxTriggersOver2Input = document.getElementById('max-triggers-over2');
const overBarrierOver2Input = document.getElementById('over-barrier-over2');
const over2RunProgressDisplay = document.getElementById('over2-run-progress');
let isBulkOver2Armed = false;
let bulkOver2TriggersFired = 0;
let bulkOver2Cooldown = false;
let isAutoTradingPOU = false;
let totalTradesExecutedPOU = 0;
let patternCooldown = false;
let recentDigitHistory = []; 
let digitFrequencyWindow = []; // rolling window for Differs auto-predict (hot digit)
const HOT_DIGIT_WINDOW_SIZE = 20;

function getHotDigit() {
    if (digitFrequencyWindow.length === 0) return null;
    const counts = new Array(10).fill(0);
    digitFrequencyWindow.forEach(d => counts[d]++);
    let hotDigit = 0;
    for (let d = 1; d <= 9; d++) {
        if (counts[d] > counts[hotDigit]) hotDigit = d;
    }
    return hotDigit;
}

const DIGIT_PATTERNS = [
    { digits: [1, 2], contract_type: 'DIGITOVER', barrier: '2', label: 'Over 2 (1\u2194 2 pattern)' },
    { digits: [7, 8], contract_type: 'DIGITUNDER', barrier: '7', label: 'Under 7 (7\u2194 8 pattern)' }
];

function matchDigitPattern(history) {
    if (history.length < 2) return null;
    const [a, b] = history;
    return DIGIT_PATTERNS.find(p =>
        (a === p.digits[0] && b === p.digits[1]) || (a === p.digits[1] && b === p.digits[0])
    ) || null;
}

function matchConsecutivePair(history, digitA, digitB) {
    if (history.length < 2) return false;
    const [a, b] = history;
    return (a === digitA && b === digitB) || (a === digitB && b === digitA);
}

if (triggerModeOver2Select) {
    triggerModeOver2Select.addEventListener('change', () => {
        const isDouble = triggerModeOver2Select.value === 'double';
        if (triggerDigit2WrapperOver2) triggerDigit2WrapperOver2.style.display = isDouble ? 'flex' : 'none';
        if (triggerDigitLabelOver2) triggerDigitLabelOver2.textContent = isDouble ? "First Trigger Digit (0-9):" : "Trigger Digit (0-9):";
    });
}

// --- TAKE PROFIT / STOP LOSS ---
function updateSessionProfitUI() {
    if (sessionProfitDisplay) {
        sessionProfitDisplay.textContent = totalSessionProfit.toFixed(2);
        sessionProfitDisplay.style.color = totalSessionProfit > 0
            ? "var(--accent-green)"
            : totalSessionProfit < 0
                ? "var(--accent-red)"
                : "var(--text-primary)";
    }
    updateTPSLProgressBar();
}

function updateTPSLProgressBar() {
    if (!tpslProgressFill) return;
    const tpTarget = parseFloat(tpTargetInput.value) || 0;
    const slTarget = parseFloat(slTargetInput.value) || 0;

    if (tpTarget <= 0 && slTarget <= 0) {
        tpslProgressFill.style.width = '0%';
        tpslProgressFill.style.left = '50%';
        return;
    }

    let halfWidthPct;
    if (totalSessionProfit >= 0) {
        halfWidthPct = tpTarget > 0 ? Math.min(totalSessionProfit / tpTarget, 1) * 50 : 0;
        tpslProgressFill.style.left = '50%';
        tpslProgressFill.style.width = `${halfWidthPct}%`;
        tpslProgressFill.style.backgroundColor = 'var(--accent-green)';
    } else {
        halfWidthPct = slTarget > 0 ? Math.min(Math.abs(totalSessionProfit) / slTarget, 1) * 50 : 0;
        tpslProgressFill.style.left = `${50 - halfWidthPct}%`;
        tpslProgressFill.style.width = `${halfWidthPct}%`;
        tpslProgressFill.style.backgroundColor = 'var(--accent-red)';
    }
}

function checkTPSLHit() {
    if (!isTPSLArmed) return;
    const tpTarget = parseFloat(tpTargetInput.value) || 0;
    const slTarget = parseFloat(slTargetInput.value) || 0;

    if (tpTarget > 0 && totalSessionProfit >= tpTarget) {
        haltAllAutoModes();
        disarmTPSL();
        showTPSLModal(true, totalSessionProfit);
    } else if (slTarget > 0 && totalSessionProfit <= -slTarget) {
        haltAllAutoModes();
        disarmTPSL();
        showTPSLModal(false, totalSessionProfit);
    }
}

function showTPSLModal(isWin, amount) {
    if (!tpslModalOverlay) return;
    if (isWin) {
        tpslModalIcon.textContent = "";
        tpslModalTitle.textContent = "Take Profit Hit!";
        tpslModalMessage.textContent = "Nice work — you hit your session take profit target. Consider calling it here.";
        tpslModalAmount.textContent = `+${amount.toFixed(2)} USD`;
        tpslModalAmount.className = "modal-amount win";
    } else {
        tpslModalIcon.textContent = "";
        tpslModalTitle.textContent = "Stop Loss Hit";
        tpslModalMessage.textContent = "Your session stop loss was reached, so auto-trading has been halted to protect your balance.";
        tpslModalAmount.textContent = `${amount.toFixed(2)} USD`;
        tpslModalAmount.className = "modal-amount loss";
    }
    tpslModalOverlay.style.display = 'flex';
}

if (btnCloseTPSLModal) {
    btnCloseTPSLModal.addEventListener('click', () => {
        tpslModalOverlay.style.display = 'none';
    });
}

function armTPSL() {
    isTPSLArmed = true;
    btnToggleTPSL.textContent = "Disarm TP/SL";
    btnToggleTPSL.classList.add('stream-active');
    tpTargetInput.disabled = true;
    slTargetInput.disabled = true;
    totalSessionProfit = 0;
    updateSessionProfitUI();
    logToConsole(`[TP/SL] Armed. Take Profit: $${tpTargetInput.value} | Stop Loss: $${slTargetInput.value}`, "success-msg");
}

function disarmTPSL() {
    isTPSLArmed = false;
    btnToggleTPSL.textContent = "Arm TP/SL";
    btnToggleTPSL.classList.remove('stream-active');
    tpTargetInput.disabled = false;
    slTargetInput.disabled = false;
}
if (btnToggleTPSL) {
    btnToggleTPSL.addEventListener('click', () => {
        if (isTPSLArmed) {
            disarmTPSL();
            logToConsole("[TP/SL] Disarmed by user.");
        } else {
            armTPSL();
        }
    });
}

function haltAllAutoModes() {
    if (isAutoTradingEO) toggleAutoEO(false);
    if (isAutoTradingOU) toggleAutoOU(false);
    if (isAutoModeBEO) stopAutoBulkModeBEO();
    if (isAutoTradingPOU) toggleAutoPOU(false);
    if (isBulkOver2Armed) disarmBulkOver2();
    isAutoModeTN = false;
    logToConsole("[Risk Management] All auto-trading modes halted.", "error-msg");
}

// --- BULK OVER 2 BUYING IN BATCHES KIJANA---
btnBuyBulkOver2.addEventListener('click', () => {
    if (isBulkOver2Armed) {
        disarmBulkOver2();
    } else {
        armBulkOver2();
    }
});

function armBulkOver2() {
    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }
    bulkOver2TriggersFired = 0;
    bulkOver2Cooldown = false;
    isBulkOver2Armed = true;

    btnBuyBulkOver2.textContent = "Disarm Bulk Over 2";
    btnBuyBulkOver2.classList.add('stream-active');
    tradeStakeOver2.disabled = true;
    tradeDurationOver2.disabled = true;
    if (triggerModeOver2Select) triggerModeOver2Select.disabled = true;
    triggerDigitOver2Input.disabled = true;
    if (triggerDigit2Over2Input) triggerDigit2Over2Input.disabled = true;
    contractsPerTriggerOver2Input.disabled = true;
    maxTriggersOver2Input.disabled = true;
    overBarrierOver2Input.disabled = true;
    if (over2RunProgressDisplay) over2RunProgressDisplay.textContent = `0 / ${maxTriggersOver2Input.value}`;

    const isDouble = triggerModeOver2Select && triggerModeOver2Select.value === 'double';
    const watchDesc = isDouble
        ? `digits ${triggerDigitOver2Input.value} & ${triggerDigit2Over2Input.value} landing back-to-back`
        : `digit ${triggerDigitOver2Input.value}`;
    logToConsole(`[Bulk Over] Armed. Watching for ${watchDesc} -- will buy ${contractsPerTriggerOver2Input.value} Over ${overBarrierOver2Input.value} contracts each time it fires.`, "success-msg");
}

function disarmBulkOver2() {
    isBulkOver2Armed = false;
    btnBuyBulkOver2.textContent = "Arm Bulk Over 2";
    btnBuyBulkOver2.classList.remove('stream-active');
    tradeStakeOver2.disabled = false;
    tradeDurationOver2.disabled = false;
    if (triggerModeOver2Select) triggerModeOver2Select.disabled = false;
    triggerDigitOver2Input.disabled = false;
    if (triggerDigit2Over2Input) triggerDigit2Over2Input.disabled = false;
    contractsPerTriggerOver2Input.disabled = false;
    maxTriggersOver2Input.disabled = false;
    overBarrierOver2Input.disabled = false;
    logToConsole("[Bulk Over] Disarmed.");
}

function fireBulkOver2Batch() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        disarmBulkOver2();
        return;
    }

    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeOver2.value);
    const duration = parseInt(tradeDurationOver2.value, 10);
    const currency = currencyText.textContent || "USD";
    const batchSize = parseInt(contractsPerTriggerOver2Input.value, 10) || 1;
    const overBarrier = overBarrierOver2Input.value.toString();
    const bulkRunToken = "BULK_OVER2_" + Date.now();
    challengeBatchExpectedCounts[bulkRunToken] = batchSize;

    for (let i = 0; i < batchSize; i++) {
        optionsWebSocket.send(JSON.stringify({
            "buy": 1,
            "price": stake,
            "subscribe": 1,
            "parameters": {
                "amount": stake,
                "basis": "stake",
                "contract_type": "DIGITOVER",
                "currency": currency,
                "duration": duration,
                "duration_unit": "t",
                "underlying_symbol": symbol,
                "barrier": overBarrier
            },
            "passthrough": { "bulkRunId": bulkRunToken }
        }));
    }

    bulkOver2TriggersFired += 1;
    const maxTriggers = parseInt(maxTriggersOver2Input.value, 10) || 10;
    if (over2RunProgressDisplay) over2RunProgressDisplay.textContent = `${bulkOver2TriggersFired} / ${maxTriggers}`;
    logToConsole(`[Bulk Over] Trigger digit hit \u2014 bought ${batchSize} Over ${overBarrier} contracts. (${bulkOver2TriggersFired}/${maxTriggers} triggers)`, "success-msg");

    if (bulkOver2TriggersFired >= maxTriggers) {
        logToConsole("[Bulk Over] Max trigger cap reached. Disarming.", "success-msg");
        disarmBulkOver2();
        return;
    }

    bulkOver2Cooldown = true;
    setTimeout(() => { bulkOver2Cooldown = false; }, (duration * 2000) + 500);
}

// --- TAB NAVIGATION LOGIC ---
const dashboardContainer = document.querySelector('.dashboard-container');
const focusBar = document.getElementById('focus-bar');
const btnExitFocus = document.getElementById('btn-exit-focus');

function enterFocusMode() {
    if (dashboardContainer) dashboardContainer.classList.add('focus-mode');
    if (focusBar) focusBar.style.display = 'flex';
}

function exitFocusMode() {
    if (dashboardContainer) dashboardContainer.classList.remove('focus-mode');
    if (focusBar) focusBar.style.display = 'none';
}

document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        if (isAutoTradingEO) toggleAutoEO(false);
        if (isAutoTradingOU) toggleAutoOU(false);
        if (isAutoTradingPOU) toggleAutoPOU(false);
        if (isBulkOver2Armed) disarmBulkOver2();
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

        button.classList.add('active');
        activeTabId = button.getAttribute('data-target');
        document.getElementById(activeTabId).classList.add('active');
        enterFocusMode();

        if (activeTabId === 'tab-match-sweep') requestMatchSweepProposal();

        logToConsole(`Switched View: ${button.textContent}`, "system-msg");
    });
});

if (btnExitFocus) {
    btnExitFocus.addEventListener('click', exitFocusMode);
}

document.querySelectorAll('.quick-nav-link').forEach(link => {
    const target = link.getAttribute('href');
    if (target === '#section-setup' || target === '#section-market' || target === '#section-logs') {
        link.addEventListener('click', exitFocusMode);
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const savedToken = localStorage.getItem('deriv_pat_token');
    const savedAppId = localStorage.getItem('deriv_app_id');
    if (savedToken) tokenInput.value = savedToken;
    if (savedAppId) appIdInput.value = savedAppId;
});

// --- API SYNC EXECUTION CONNECTIONS ---
btnFetch.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const appId = appIdInput.value.trim();
    if (!token || !appId) return;
    
    try {
        const response = await fetch(`${BASE_URL}/trading/v1/options/accounts`, {
            method: 'GET',
            headers: { 'Deriv-App-ID': appId, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const result = JSON.parse(await response.text());
        accountList = result.data || [];
        localStorage.setItem('deriv_pat_token', token);
        localStorage.setItem('deriv_app_id', appId);
        apiStatus.textContent = "Synced";
        populateDropdown(accountList);
    } catch (e) { logToConsole(e.message, "error-msg"); }
});

if (btnBuyBEO) {
    btnBuyBEO.addEventListener("click", executeBulkEvenOddPair);
} else {
    console.error("CRITICAL: btn-buy-beo not found in the DOM!");
}

btnToggleAutoBEO.addEventListener("click", () => {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Cannot start automation without an active stream link.", "error-msg");
        return;
    }

    if (isAutoModeBEO) {
        stopAutoBulkModeBEO();
    } else {
        startAutoBulkModeBEO();
    }
});

document.getElementById("btn-clear-ledger").addEventListener("click", () => {
    const ledgerBody = document.getElementById("ledger-body");

    if (!ledgerBody) {
        console.error("CRITICAL: ledger-body not found in the DOM!");
        return;
    }

    ledgerBody.innerHTML = '';
    const emptyRow = document.createElement('tr');
    emptyRow.id = 'ledger-empty-row';
    emptyRow.innerHTML = `
        <td colspan="3" style="text-align: center; color: #888; padding: 20px;">
            No bulk operations logged in this session yet.
        </td>
    `;
    ledgerBody.appendChild(emptyRow);
    totalTradesExecutedTN = 0;
    if (typeof totalSessionProfit !== 'undefined') {
        totalSessionProfit = 0;
        updateSessionProfitUI();
    }

    logToConsole("Ledger cleared successfully.");
});

function addToLedger(data) {
    const ledgerBody = document.getElementById("ledger-body");
    const emptyRow = document.getElementById("ledger-empty-row");
    if (emptyRow) {
        ledgerBody.innerHTML = ""; 
    }

    // 2. Creating a new row
    const row = document.createElement("tr");
    row.innerHTML = `
        <td>${data.type}</td>
        <td>${data.spot}</td>
        <td style="text-align: right;">${data.price}</td>
    `;

    ledgerBody.appendChild(row);
}

function startAutoBulkModeBEO() {
    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    isAutoModeBEO = true;
    totalTradesExecutedBEO = 0; 
    trackingSettledContractsBEO = 0;
    
    btnToggleAutoBEO.textContent = "Stop Auto Mode";
    btnToggleAutoBEO.style.backgroundColor = "#ff3b30"; 
    btnToggleAutoBEO.style.color = "#ffffff";
    
    logToConsole("[Auto Engine] Bulk Even/Odd Automation Started...", "success-msg");
    executeBulkEvenOddPair();
}

function stopAutoBulkModeBEO() {
    isAutoModeBEO = false;
    btnToggleAutoBEO.textContent = "Start Auto Bulk Mode";
    btnToggleAutoBEO.style.backgroundColor = ""; 
    btnToggleAutoBEO.style.color = "";
    logToConsole("[Auto Engine] Bulk Even/Odd Automation Stopped by user request.");
}
function populateDropdown(accounts) {
    dropdown.innerHTML = "";
    accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.account_id;
        opt.textContent = `${acc.account_id} (${acc.account_type})`;
        dropdown.appendChild(opt);
    });
    dropdown.disabled = false;
    updateActiveAccountView(accounts[0].account_id);
}

dropdown.addEventListener('change', (e) => {
    disconnectExistingStream();
    updateActiveAccountView(e.target.value);
});

function updateActiveAccountView(accountId) {
    const selected = accountList.find(a => a.account_id === accountId);
    if (!selected) return;
    balanceText.textContent = selected.balance.toLocaleString(undefined, { minimumFractionDigits: 2 });
    currencyText.textContent = selected.currency;
    badge.textContent = selected.account_type;
    badge.className = `badge ${selected.account_type}`;
if (selected.account_type === 'demo') {
        btnResetBalance.style.display = 'block';
        btnResetBalance.disabled = false;
    } else {
        btnResetBalance.style.display = 'none';
    }
    logToConsole(`Switched active context to: ${accountId}`);
}

/*
 Reset Demo Account Balance (POST /trading/v1/options/accounts/{account_id}/reset-demo-balance)
 */
btnResetBalance.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const appId = appIdInput.value.trim();
    const activeAccountId = dropdown.value;

    if (!activeAccountId) return;
    btnResetBalance.disabled = true;

    try {
        const response = await fetch(`${BASE_URL}/trading/v1/options/accounts/${activeAccountId}/reset-demo-balance`, {
            method: 'POST',
            headers: {
                'Deriv-App-ID': appId,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const responseText = await response.text();
        if (!response.ok) {
            const errorJson = JSON.parse(responseText);
            throw new Error(errorJson.errors ? errorJson.errors[0].message : "Reset failed");
        }

        const result = JSON.parse(responseText);
        logToConsole(`Demo balance successfully reset to ${result.data.balance} ${result.data.currency}.`, "success-msg");
        
        const targetAcc = accountList.find(a => a.account_id === activeAccountId);
        if (targetAcc) {
            targetAcc.balance = result.data.balance;
            updateActiveAccountView(activeAccountId);
        }
    } catch (error) {
        logToConsole(`Reset Failed: ${error.message}`, "error-msg");
    } finally {
        btnResetBalance.disabled = false;
    }
})

// --- WEBSOCKET ROUTING SWITCHBOARD ---
btnToggleStream.addEventListener('click', async () => {
    if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN) {
        disconnectExistingStream();
        return;
    }
    const token = tokenInput.value.trim();
    const appId = appIdInput.value.trim();
    const activeAccountId = dropdown.value;
    if (!activeAccountId) return;

    btnToggleStream.disabled = true;
    
    try {
        const response = await fetch(`${BASE_URL}/trading/v1/options/accounts/${activeAccountId}/otp`, {
            method: 'POST',
            headers: { 'Deriv-App-ID': appId, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const result = JSON.parse(await response.text());
        const wsUrl = result.data.url;
        
        optionsWebSocket = new WebSocket(wsUrl);

        optionsWebSocket.onopen = () => {
            logToConsole("Connected! Live Stream Active.", "success-msg");
            const token = tokenInput.value.trim();
    optionsWebSocket.send(JSON.stringify({ "authorize": token }));
            btnToggleStream.disabled = false;
            btnToggleStream.textContent = "Disconnect Stream";
            btnToggleStream.classList.add('stream-active');
            marketPanel.style.display = 'flex';
            
            updateTradeControlsState(true);
            optionsWebSocket.send(JSON.stringify({ "active_symbols": "brief" }));
            optionsWebSocket.send(JSON.stringify({ "active_symbols": "brief" }));
            if (activeTabId === 'tab-match-sweep') requestMatchSweepProposal();

        };
optionsWebSocket.onmessage = (event) => {
    
    const incoming = JSON.parse(event.data);
    if (incoming.error) {
        const reqType = incoming.echo_req ? Object.keys(incoming.echo_req).find(k => ['buy', 'proposal_open_contract', 'sell', 'proposal'].includes(k)) : 'unknown';
        logToConsole(`[Stream Error] (${reqType}) ${incoming.error.code}: ${incoming.error.message}`, "error-msg");
        return;
    }
    if (incoming.msg_type === "topup_virtual") {
        logToConsole("Balance reset successful!", "success-msg");
        optionsWebSocket.send(JSON.stringify({ "balance": 1, "subscribe": 1 }));
    } else if (incoming.msg_type === "balance") {
        updateBalanceUI(incoming.balance);
    }
    if (incoming.msg_type === "active_symbols") {
        populateMarketDropdown(incoming.active_symbols);
    } else if (incoming.msg_type === "tick") {
        handleIncomingTickPacket(incoming.tick);
    } else if (incoming.msg_type === "buy") {
        handlePurchaseReceipt(incoming.buy, incoming.passthrough);
    } else if (incoming.msg_type === "proposal_open_contract") {
        handleContractUpdate(incoming.proposal_open_contract);
    } else if (incoming.msg_type === "proposal") {
        handleMatchSweepProposal(incoming.proposal);
    }
};

        optionsWebSocket.onclose = () => disconnectExistingStream();

    } catch (error) {
        disconnectExistingStream();
    }
});


function populateMarketDropdown(symbolsArray) {
    marketDropdown.innerHTML = "";
    symbolsArray.forEach(sym => {
        const opt = document.createElement('option');
        opt.value = sym.underlying_symbol;
        opt.textContent = sym.underlying_symbol_name;
        marketDropdown.appendChild(opt);
    });
    subscribeToSymbolTicks(symbolsArray[0].underlying_symbol);
}

marketDropdown.addEventListener('change', (e) => {
    if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN && e.target.value) {
        subscribeToSymbolTicks(e.target.value);
        if (activeTabId === 'tab-match-sweep') requestMatchSweepProposal();
    }
});

function subscribeToSymbolTicks(symbolCode) {
    if (optionsWebSocket) optionsWebSocket.send(JSON.stringify({ "ticks": symbolCode }));
}

// --- AUTO ENGINE RUNNER AND TICK PROCESSING ---
function handleIncomingTickPacket(tickData) {
    if (!tickData || !tickData.quote) return;
    const priceString = tickData.quote.toString();
    const lastDigit = parseInt(priceString.charAt(priceString.length - 1), 10);

    recentDigitHistory.push(lastDigit);
    if (recentDigitHistory.length > 2) recentDigitHistory.shift();

    digitFrequencyWindow.push(lastDigit);
    if (digitFrequencyWindow.length > HOT_DIGIT_WINDOW_SIZE) digitFrequencyWindow.shift();
    if (predictedDigitTNDisplay && autoPredictTN && autoPredictTN.checked) {
        const hotDigit = getHotDigit();
        predictedDigitTNDisplay.value = hotDigit === null ? '--' : hotDigit;
    }

    let patternFired = false;
    let stopAutoPOU = false;
    let patternMatch = null;

    if (!isChallengeLocked()) {
        if (activeTabId === 'tab-pattern-ou' && isAutoTradingPOU && !patternCooldown) {
            const maxAllowed = parseInt(maxTradesPOUInput.value, 10) || 10;
            if (totalTradesExecutedPOU + 1 > maxAllowed) {
                stopAutoPOU = true;
            } else {
                const match = matchDigitPattern(recentDigitHistory);
                if (match) {
                    patternMatch = match;
                    executePatternOverUnder(match);
                    recentDigitHistory = [];
                    patternFired = true;
                }
            }
        }

        if (activeTabId === 'tab-bulk-ou' && isBulkOver2Armed && !bulkOver2Cooldown) {
            const isDoubleMode = triggerModeOver2Select && triggerModeOver2Select.value === 'double';
            if (isDoubleMode) {
                const digitA = parseInt(triggerDigitOver2Input.value, 10);
                const digitB = parseInt(triggerDigit2Over2Input.value, 10);
                if (matchConsecutivePair(recentDigitHistory, digitA, digitB)) {
                    fireBulkOver2Batch();
                    recentDigitHistory = [];
                }
            } else {
                const triggerDigit = parseInt(triggerDigitOver2Input.value, 10);
                if (lastDigit === triggerDigit) {
                    fireBulkOver2Batch();
                }
            }
        }

        if (activeTabId === 'tab-even-odd' && isAutoTradingEO) {
            const isEven = lastDigit % 2 === 0;
            const selectedMode = strategyModeEO.value;
            if ((selectedMode === "DIGITEVEN" && isEven) || (selectedMode === "DIGITODD" && !isEven)) {
                executeContractEO();
            }
        }
        else if (activeTabId === 'tab-bulk-ou' && isAutoTradingOU && !autoBulkCooldown) {
            // A single fire now sends the whole batch of Over/Under pairs on this tick, so just fire once and stop.
            executeBulkOverUnderPair();

            const durationTicks = parseInt(tradeDurationOU.value, 10);
            autoBulkCooldown = true;
            btnBuyOU.disabled = true;

            setTimeout(() => {
                autoBulkCooldown = false;
                if (!isAutoTradingOU) btnBuyOU.disabled = false;
            }, (durationTicks * 2000) + 1200);

            logToConsole(`[Bulk Auto Triggered] Firing full pair batch on this tick...`, "system-msg");
            toggleAutoOU(false);
        }
    }

    // --- COLD PATH: pure display work, safe to run after the trade is sent.
    liveTickValue.textContent = tickData.quote.toLocaleString(undefined, { minimumFractionDigits: 2 });
    liveDigitValue.textContent = lastDigit;
    if (patternDigitHistoryDisplay) {
        patternDigitHistoryDisplay.textContent = recentDigitHistory.join(' ') || '--';
    }
    if (stopAutoPOU) {
        logToConsole(`[Pattern OU] Max trade cap reached (${totalTradesExecutedPOU}/${parseInt(maxTradesPOUInput.value, 10) || 10}). Stopping execution.`, "system-msg");
        toggleAutoPOU(false);
    }
    if (patternFired && patternMatch) {
        logToConsole(`[Pattern OU] Detected pattern -> firing ${patternMatch.label}`, "success-msg");
        if (patternLastMatchDisplay) patternLastMatchDisplay.textContent = `${patternMatch.label} @ ${new Date().toLocaleTimeString()}`;
    }
}

// --- CONTRACT ORDER PLACEMENT CONTROLLERS ---
function executeBulkEvenOddPair() {
    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }

    const maxCap = parseInt(maxTradesBEO.value, 10);  
    if (totalTradesExecutedBEO + 2 > maxCap) {
        logToConsole(`[Bulk EO] Halt: Running this pair would exceed your Max Trades Run Cap of ${maxCap}.`, "error-msg");
        return;
    }
    
    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeBEO.value);
    const duration = parseInt(tradeDurationBEO.value, 10);
    const currency = currencyText.textContent || "USD";
    
    const bulkRunToken = "BULK_EO_" + Date.now();
    challengeBatchExpectedCounts[bulkRunToken] = 2;

    const payloadEven = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": "DIGITEVEN",
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    const payloadOdd = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": "DIGITODD",
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    logToConsole(`[${bulkRunToken}] Synchronizing parallel Even/Odd executions...`);
    
    optionsWebSocket.send(JSON.stringify(payloadEven));
    optionsWebSocket.send(JSON.stringify(payloadOdd));
    totalTradesExecutedBEO += 2;
    logToConsole(`[Bulk EO Run Status]: ${totalTradesExecutedBEO} / ${maxCap} individual contracts executed.`);
}
function executeContractEO() {
    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    if (!optionsWebSocket) return;
    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeEO.value);
    
    const payload = {
        "buy": "1",
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": strategyModeEO.value,
            "currency": currencyText.textContent || "USD",
            "duration": parseInt(tradeDurationEO.value, 10),
            "duration_unit": "t",
            "underlying_symbol": symbol
        }
    };
    logToConsole(`Sending EO Order: $${stake}...`);
    optionsWebSocket.send(JSON.stringify(payload));
}

function executeBulkOverUnderPair() {
    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }
    
    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakeOU.value);
    const duration = parseInt(tradeDurationOU.value, 10);
    const currency = currencyText.textContent || "USD";
    
    const overDigit = predOverInput.value.toString();
    const underDigit = predUnderInput.value.toString();
    const batchSize = parseInt(maxTradesOUInput.value, 10) || 1; // Max Trades Run Cap now doubles as "repeat the pair this many times on this same tick", same pattern as Bulk Over 2's contracts-per-trigger
    const bulkRunToken = "BULK_" + Date.now();
    challengeBatchExpectedCounts[bulkRunToken] = batchSize * 2;

    for (let i = 0; i < batchSize; i++) {
        optionsWebSocket.send(JSON.stringify({
            "buy": 1,
            "price": stake,
            "subscribe": 1,
            "parameters": {
                "amount": stake,
                "basis": "stake",
                "contract_type": "DIGITOVER",
                "currency": currency,
                "duration": duration,
                "duration_unit": "t",
                "underlying_symbol": symbol,
                "barrier": overDigit
            },
            "passthrough": { "bulkRunId": bulkRunToken }
        }));

        optionsWebSocket.send(JSON.stringify({
            "buy": 1,
            "price": stake,
            "subscribe": 1,
            "parameters": {
                "amount": stake,
                "basis": "stake",
                "contract_type": "DIGITUNDER",
                "currency": currency,
                "duration": duration,
                "duration_unit": "t",
                "underlying_symbol": symbol,
                "barrier": underDigit
            },
            "passthrough": { "bulkRunId": bulkRunToken }
        }));
    }

    totalTradesExecutedOU += batchSize * 2;

    logToConsole(`[${bulkRunToken}] Fired ${batchSize} Over/Under pairs (${batchSize * 2} contracts) on this tick.`, "success-msg");
}

function executePatternOverUnder(match) {
    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: Real-time stream must be connected before running trades.", "error-msg");
        return;
    }

    const symbol = marketDropdown.value;
    const stake = parseFloat(tradeStakePOU.value);
    const duration = parseInt(tradeDurationPOU.value, 10);
    const currency = currencyText.textContent || "USD";
    const bulkRunToken = "PATTERN_OU_" + Date.now();
    challengeBatchExpectedCounts[bulkRunToken] = 1;

    const payload = {
        "buy": 1,
        "price": stake,
        "subscribe": 1,
        "parameters": {
            "amount": stake,
            "basis": "stake",
            "contract_type": match.contract_type,
            "currency": currency,
            "duration": duration,
            "duration_unit": "t",
            "underlying_symbol": symbol,
            "barrier": match.barrier
        },
        "passthrough": { "bulkRunId": bulkRunToken }
    };

    optionsWebSocket.send(JSON.stringify(payload));
    totalTradesExecutedPOU += 1;
    logToConsole(`[Pattern OU Run Status]: ${totalTradesExecutedPOU} / ${maxTradesPOUInput.value} contracts executed.`);
    patternCooldown = true;
    setTimeout(() => { patternCooldown = false; }, (duration * 2000) + 500);
}

btnToggleAutoPOU.addEventListener('click', () => toggleAutoPOU(!isAutoTradingPOU));
function toggleAutoPOU(state) {
    if (state && isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    isAutoTradingPOU = state;
    btnToggleAutoPOU.textContent = state ? "Stop Pattern Auto-Mode" : "Start Pattern Auto-Mode";
    btnToggleAutoPOU.classList.toggle('stream-active', state);

    tradeStakePOU.disabled = state;
    tradeDurationPOU.disabled = state;
    maxTradesPOUInput.disabled = state;

    if (state) {
        patternCooldown = false;
        totalTradesExecutedPOU = 0;
        recentDigitHistory = [];
        if (patternLastMatchDisplay) patternLastMatchDisplay.textContent = "None";
        logToConsole(`Pattern Auto-Mode Started. Cap Target: ${maxTradesPOUInput.value} trades. Watching for 1/2 and 7/8 sequences...`, "success-msg");
    } else {
        logToConsole("Pattern Auto-Mode Stopped.");
    }
}

// ---  LEDGER DOM DATA  ---
function handlePurchaseReceipt(buyReceipt, passthrough) {
    if (!buyReceipt || !buyReceipt.contract_id) return;
    logToConsole(`[Receipt] ID: ${buyReceipt.contract_id} | ${buyReceipt.shortcode}`, "success-msg");
    
    if (buyReceipt.balance_after) {
        balanceText.textContent = buyReceipt.balance_after.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }

    if (emptyRow) emptyRow.remove();

    const isOver = buyReceipt.shortcode.includes("DIGITOVER");
    const directionArrow = isOver 
        ? `<span style="color: var(--accent-green); font-weight: bold; font-size: 1.1rem;">↗</span>` 
        : `<span style="color: var(--accent-red); font-weight: bold; font-size: 1.1rem;">↘</span>`;

    const marketRaw = marketDropdown.value || "";
    const marketBadge = marketRaw.includes("10") ? "10s" : "100s"; 

    const tr = document.createElement('tr');
    tr.id = `contract-row-${buyReceipt.contract_id}`;
    tr.dataset.batchKey = (passthrough && passthrough.bulkRunId) ? passthrough.bulkRunId : `SOLO_${buyReceipt.contract_id}`;
    tr.innerHTML = `
        <td>
            <div class="type-cell-wrapper">
                <span class="market-mini-badge">${marketBadge}</span>
                ${directionArrow}
            </div>
        </td>
        <td>
            <div class="spot-row">
                <span class="dot entry-dot"></span>
                <span class="row-entry-price">--.--</span>
            </div>
            <div class="spot-row">
                <span class="dot exit-dot"></span>
                <span class="row-exit-digit">--.--</span>
            </div>
        </td>
        <td class="price-col">
            <div class="row-buy-price">${parseFloat(buyReceipt.buy_price || tradeStakeOU.value).toFixed(2)} USD</div>
            <div class="row-profit-loss" style="color: var(--text-secondary);">--.--</div>
        </td>
    `;
    ledgerBody.insertBefore(tr, ledgerBody.firstChild);
}
function handleContractUpdate(contract) {
    if (!contract || !contract.contract_id) return;
    logToConsole(`[Stream] Contract ${contract.contract_id} \u2192 status: ${contract.status ?? 'n/a'}, profit: ${contract.profit ?? 'n/a'}, is_expired: ${contract.is_expired ?? 'n/a'}`, "system-msg");

    if (contract.status === "won" || contract.status === "lost") {
        if (contract.passthrough?.bulkRunId?.startsWith("BULK_DIFF_")) {
            if (isAutoModeTN && totalTradesExecutedTN < parseInt(maxTradesTN.value)) {
                setTimeout(executeBulkDiffers, 1000);
            } else if (isAutoModeTN) {
                logToConsole("Max Differs runs reached.");
                isAutoModeTN = false;
                if (btnToggleAutoTN) {
                    btnToggleAutoTN.textContent = "Auto Bulk Mode";
                    btnToggleAutoTN.classList.remove('stream-active');
                }
            }
        }
    }

    const row = document.getElementById(`contract-row-${contract.contract_id}`);
    if (!row) {
        logToConsole(`[Stream] Contract ${contract.contract_id} update arrived but no matching ledger row exists \u2014 dropped.`, "error-msg");
        return;
    }

    const currencySymbol = contract.currency || "USD";

    // Update Buy Price row text if available
    if (contract.buy_price) {
        row.querySelector('.row-buy-price').textContent = `${parseFloat(contract.buy_price).toFixed(2)} ${currencySymbol}`;
    }

    // Update Entry Spot visual text
    if (contract.entry_spot) {
        row.querySelector('.row-entry-price').textContent = parseFloat(contract.entry_spot).toFixed(2);
    }

    // Update Exit or Current Spot text in real-time
    if (contract.exit_spot || contract.current_spot) {
        const activeSpot = contract.exit_spot || contract.current_spot;
        row.querySelector('.row-exit-digit').textContent = parseFloat(activeSpot).toFixed(2);
    }

    // Update Profit/Loss visualization colors and strings
    if (contract.profit !== undefined) {
        const profitValue = parseFloat(contract.profit);
        const profitCell = row.querySelector('.row-profit-loss');

        if (contract.status === "open") {
            profitCell.textContent = `${profitValue >= 0 ? '+' : ''}${profitValue.toFixed(2)} ${currencySymbol}`;
            profitCell.style.color = profitValue >= 0 ? "var(--accent-green)" : "var(--accent-red)";
        } else if (contract.status === "won") {
            profitCell.textContent = `${profitValue >= 0 ? '+' : ''}${profitValue.toFixed(2)} ${currencySymbol}`;
            profitCell.className = "row-profit-loss text-win";
            profitCell.style.color = "var(--text-primary)";
        } else if (contract.status === "lost") {
            profitCell.textContent = `${profitValue.toFixed(2)} ${currencySymbol}`;
            profitCell.className = "row-profit-loss text-loss";
            profitCell.style.color = "var(--accent-red)";
        }

        if ((contract.status === "won" || contract.status === "lost") && row.dataset.settled !== "1") {
            row.dataset.settled = "1";
            totalSessionProfit += profitValue;
            updateSessionProfitUI();
            checkTPSLHit();
            showPnlToast(calculateLedgerTotal());
        }
    }

    if (contract.status === "won" || contract.status === "lost") {
        if (optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN && contract.id) {
            optionsWebSocket.send(JSON.stringify({
                "forget": contract.id
            }));
            logToConsole(`[Cleanup] Sent forget handshake for subscription ID: ${contract.id}`);
        }
    }
}

// --- INTERFACE CONTROL HANDLERS ---
btnBuyEO.addEventListener('click', executeContractEO);
btnBuyOU.addEventListener('click', executeBulkOverUnderPair);

btnToggleAutoEO.addEventListener('click', () => toggleAutoEO(!isAutoTradingEO));
function toggleAutoEO(state) {
    if (state && isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    isAutoTradingEO = state;
    btnToggleAutoEO.textContent = state ? "Stop Auto Mode" : "Start Auto-Mode";
    btnToggleAutoEO.classList.toggle('stream-active', state);
    btnBuyEO.disabled = state;
    if(state) logToConsole("EO Auto-Mode Active.", "success-msg");
}

btnToggleAutoOU.addEventListener('click', () => toggleAutoOU(!isAutoTradingOU));
function toggleAutoOU(state) {
    if (state && isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        return;
    }
    isAutoTradingOU = state;
    btnToggleAutoOU.textContent = state ? "Stop Auto Bulk Mode" : "Start Auto Bulk Mode";
    btnToggleAutoOU.classList.toggle('stream-active', state);
    
    predOverInput.disabled = state;
    predUnderInput.disabled = state;
    tradeStakeOU.disabled = state;
    tradeDurationOU.disabled = state;
    maxTradesOUInput.disabled = state;
    
    if(state) {
        autoBulkCooldown = false; 
        totalTradesExecutedOU = 0; 
        logToConsole(`Bulk Auto-Mode Started. Will fire ${maxTradesOUInput.value} Over/Under pairs on the next qualifying tick, then auto-stop.`, "success-msg");
    }
}

const btnBuyTN = document.getElementById("btn-buy-tn");
const btnToggleAutoTN = document.getElementById("btn-toggle-auto-tn");
const tradeStakeTN = document.getElementById("trade-stake-tn");
const tradeDigitTN = document.getElementById("trade-digit-tn");
const maxTradesTN = document.getElementById("max-trades-tn");
const autoPredictTN = document.getElementById("auto-predict-tn");
const predictedDigitTNDisplay = document.getElementById("predicted-digit-tn-display");

let isAutoModeTN = false;
let totalTradesExecutedTN = 0;

if (autoPredictTN) {
    autoPredictTN.addEventListener('change', () => {
        tradeDigitTN.disabled = autoPredictTN.checked;
        if (!autoPredictTN.checked && predictedDigitTNDisplay) predictedDigitTNDisplay.value = '--';
    });
}

function executeBulkDiffers() {

    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        isAutoModeTN = false;
        return;
    }

    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: WebSocket not connected.", "error-msg");
        return;
    }

    const stake = parseFloat(tradeStakeTN.value);
    let digitStr;
    if (autoPredictTN && autoPredictTN.checked) {
        const hotDigit = getHotDigit();
        if (hotDigit === null) {
            logToConsole("[Differs] Not enough tick history yet to predict a digit. Waiting for more ticks.", "error-msg");
            return;
        }
        digitStr = hotDigit.toString();
        if (predictedDigitTNDisplay) predictedDigitTNDisplay.value = digitStr;
        logToConsole(`[Differs] Auto-predicted digit ${digitStr} (hottest over last ${digitFrequencyWindow.length} ticks).`, "system-msg");
    } else {
        digitStr = parseInt(tradeDigitTN.value, 10).toString();
    }
    const duration = parseInt(document.getElementById("trade-duration-tn").value) || 5;
    const batchSize = parseInt(maxTradesTN.value, 10) || 1; // Max Trades Cap doubles as "repeat this many times on this same tick", same pattern as Bulk Over/Under
    const bulkRunToken = "BULK_DIFF_" + Date.now();
    challengeBatchExpectedCounts[bulkRunToken] = batchSize;

    const baseParams = {
        "amount": stake,
        "basis": "stake",
        "currency": currencyText.textContent || "USD",
        "duration": duration,
        "duration_unit": "t",
        "underlying_symbol": marketDropdown.value,
        "barrier": digitStr
    };

    for (let i = 0; i < batchSize; i++) {
        optionsWebSocket.send(JSON.stringify({
            "buy": 1,
            "price": stake,
            "subscribe": 1,
            "parameters": { ...baseParams, "contract_type": "DIGITDIFF" },
            "passthrough": { "bulkRunId": bulkRunToken }
        }));
    }

    totalTradesExecutedTN += batchSize;
    logToConsole(`[Differs] Fired ${batchSize} Differ ${digitStr} contracts on this tick.`, "success-msg");
}


if (btnBuyTN) {
    btnBuyTN.addEventListener("click", executeBulkDiffers);
    console.log("Event listener attached successfully to btn-buy-tn");
} else {
    console.error("CRITICAL: btn-buy-tn not found in the DOM!");
}

if (btnToggleAutoTN) {
    btnToggleAutoTN.addEventListener("click", () => {
        if (!isAutoModeTN && isChallengeLocked()) {
            logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
            return;
        }
        isAutoModeTN = !isAutoModeTN;
        btnToggleAutoTN.textContent = isAutoModeTN ? "Stop Auto Bulk Mode" : "Auto Bulk Mode";
        btnToggleAutoTN.classList.toggle('stream-active', isAutoModeTN);
        if (isAutoModeTN) {
            totalTradesExecutedTN = 0;
            logToConsole(`[Differs] Auto Bulk Mode started. Will fire ${maxTradesTN.value} Differ contracts on the next qualifying tick, then auto-stop.`, "success-msg");
            executeBulkDiffers();
        } else {
            logToConsole("[Differs] Auto Bulk Mode stopped by user request.");
        }
    });
}

// --- MATCH SWEEP (1-9) ---
const btnBuyMS = document.getElementById("btn-buy-ms");
const btnToggleAutoMS = document.getElementById("btn-toggle-auto-ms");
const tradeStakeMS = document.getElementById("trade-stake-ms");
const tradeDurationMS = document.getElementById("trade-duration-ms");
const totalCostMSDisplay = document.getElementById("total-cost-ms-display");
const msExpectedLossBox = document.getElementById("ms-expected-loss-box");
const msExpectedLossText = document.getElementById("ms-expected-loss-text");

let isAutoModeMS = false;
let totalTradesExecutedMS = 0;
const MATCH_SWEEP_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
let msProposalSubscriptionId = null;
let msProposalDebounceTimer = null;

function updateMatchSweepCostDisplay() {
    if (!tradeStakeMS || !totalCostMSDisplay) return;
    const stake = parseFloat(tradeStakeMS.value) || 0;
    totalCostMSDisplay.value = (stake * MATCH_SWEEP_DIGITS.length).toFixed(2);
}

function requestMatchSweepProposal() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) return;
    if (!msExpectedLossText) return;

    const stake = parseFloat(tradeStakeMS.value);
    const duration = parseInt(tradeDurationMS.value, 10) || 1;
    if (!stake || stake <= 0) {
        msExpectedLossText.textContent = "Enter a stake to see the expected result.";
        return;
    }

    if (msProposalSubscriptionId) {
        optionsWebSocket.send(JSON.stringify({ "forget": msProposalSubscriptionId }));
        msProposalSubscriptionId = null;
    }

    msExpectedLossText.textContent = "Fetching live payout...";

    optionsWebSocket.send(JSON.stringify({
        "proposal": 1,
        "subscribe": 1,
        "amount": stake,
        "basis": "stake",
        "contract_type": "DIGITMATCH",
        "currency": currencyText.textContent || "USD",
        "duration": duration,
        "duration_unit": "t",
        "underlying_symbol": marketDropdown.value,
        "barrier": "1",
        "passthrough": { "msProposal": true }
    }));
}

function handleMatchSweepProposal(proposal) {
    if (!proposal || !msExpectedLossText) return;
    if (proposal.id) msProposalSubscriptionId = proposal.id;

    const stake = parseFloat(tradeStakeMS.value);
    const payout = parseFloat(proposal.payout);
    if (isNaN(payout) || isNaN(stake) || stake <= 0) return;

    const profitPerLeg = payout - stake;
    const legCount = MATCH_SWEEP_DIGITS.length;
    const winCaseResult = profitPerLeg - (stake * (legCount - 1)); // 1 leg wins, other 8 lose
    const loseCaseResult = -(stake * legCount); // digit 0 hits, everything loses
    const expectedValue = (0.9 * winCaseResult) + (0.1 * loseCaseResult);

    const verdict = expectedValue >= 0 ? "PROFITABLE" : "A LOSS";
    msExpectedLossBox.style.borderColor = expectedValue >= 0 ? "var(--accent-green)" : "var(--accent-red)";
    msExpectedLossBox.style.background = expectedValue >= 0 ? "var(--green-glow)" : "var(--red-glow)";

    msExpectedLossText.textContent =
        `On a win (~90% of ticks): ${winCaseResult >= 0 ? '+' : ''}${winCaseResult.toFixed(2)}. ` +
        `On digit 0 (~10% of ticks): ${loseCaseResult.toFixed(2)}. ` +
        `Expected value per sweep: ${expectedValue >= 0 ? '+' : ''}${expectedValue.toFixed(2)} (${verdict}), based on live payout of ${payout.toFixed(2)} per ${stake.toFixed(2)} stake.`;
}

if (tradeStakeMS) {
    tradeStakeMS.addEventListener('input', () => {
        updateMatchSweepCostDisplay();
        clearTimeout(msProposalDebounceTimer);
        msProposalDebounceTimer = setTimeout(requestMatchSweepProposal, 600);
    });
    updateMatchSweepCostDisplay();
}
if (tradeDurationMS) {
    tradeDurationMS.addEventListener('input', () => {
        clearTimeout(msProposalDebounceTimer);
        msProposalDebounceTimer = setTimeout(requestMatchSweepProposal, 600);
    });
}

function executeMatchSweep() {

    if (isChallengeLocked()) {
        logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
        isAutoModeMS = false;
        return;
    }

    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: WebSocket not connected.", "error-msg");
        return;
    }

    const stake = parseFloat(tradeStakeMS.value);
    const duration = parseInt(tradeDurationMS.value, 10) || 1;
    const bulkRunToken = "BULK_MS_" + Date.now();
    challengeBatchExpectedCounts[bulkRunToken] = MATCH_SWEEP_DIGITS.length;

    const baseParams = {
        "amount": stake,
        "basis": "stake",
        "currency": currencyText.textContent || "USD",
        "duration": duration,
        "duration_unit": "t",
        "underlying_symbol": marketDropdown.value,
        "contract_type": "DIGITMATCH"
    };

    MATCH_SWEEP_DIGITS.forEach(digit => {
        optionsWebSocket.send(JSON.stringify({
            "buy": 1,
            "price": stake,
            "subscribe": 1,
            "parameters": { ...baseParams, "barrier": digit.toString() },
            "passthrough": { "bulkRunId": bulkRunToken }
        }));
    });

    totalTradesExecutedMS += MATCH_SWEEP_DIGITS.length;
    logToConsole(`[Match Sweep] Fired Match 1-9 (${MATCH_SWEEP_DIGITS.length} contracts, ${(stake * MATCH_SWEEP_DIGITS.length).toFixed(2)} total stake) on this tick.`, "success-msg");
}

if (btnBuyMS) {
    btnBuyMS.addEventListener("click", executeMatchSweep);
} else {
    console.error("CRITICAL: btn-buy-ms not found in the DOM!");
}

if (btnToggleAutoMS) {
    btnToggleAutoMS.addEventListener("click", () => {
        if (!isAutoModeMS && isChallengeLocked()) {
            logToConsole("[Challenge] Trading is locked until the next trading day.", "error-msg");
            return;
        }
        isAutoModeMS = !isAutoModeMS;
        btnToggleAutoMS.textContent = isAutoModeMS ? "Stop Auto Bulk Mode" : "Auto Bulk Mode";
        btnToggleAutoMS.classList.toggle('stream-active', isAutoModeMS);
        if (isAutoModeMS) {
            totalTradesExecutedMS = 0;
            logToConsole("[Match Sweep] Auto Bulk Mode started. Firing a Match 1-9 sweep now, then auto-stopping.", "success-msg");
            executeMatchSweep();
        } else {
            logToConsole("[Match Sweep] Auto Bulk Mode stopped by user request.");
        }
    });
}

document.getElementById("btn-reset-balance").addEventListener("click", () => {
    if (confirm("Are you sure you want to reset your demo balance to 10,000 USD?")) {
        resetDemoBalance();
    }
});

// The Reset button functi
function resetDemoBalance() {
    if (!optionsWebSocket || optionsWebSocket.readyState !== WebSocket.OPEN) {
        logToConsole("Error: WebSocket not connected.", "error-msg");
        return;
    }

    optionsWebSocket.send(JSON.stringify({
        "topup_virtual": 1
    }));
    
    logToConsole("Requesting balance reset...");
}

function updateTradeControlsState(isActive) {
    const isReady = isActive && optionsWebSocket && optionsWebSocket.readyState === WebSocket.OPEN;
    btnBuyEO.disabled = !isReady;
    btnToggleAutoEO.disabled = !isReady;
    btnBuyOU.disabled = !isReady;
    btnToggleAutoOU.disabled = !isReady;
    btnToggleAutoPOU.disabled = !isReady;
    btnBuyBulkOver2.disabled = !isReady;
    if (!isReady) { toggleAutoEO(false); toggleAutoOU(false); toggleAutoPOU(false); if (isBulkOver2Armed) disarmBulkOver2(); }
}

function disconnectExistingStream() {
    if (optionsWebSocket) { optionsWebSocket.close(); optionsWebSocket = null; }
    msProposalSubscriptionId = null;
    updateTradeControlsState(false);
    marketPanel.style.display = 'none';
    btnToggleStream.disabled = false;
    btnToggleStream.textContent = "Connect Real-Time Stream";
    btnToggleStream.classList.remove('stream-active');
}

function logToConsole(message, className = "") {
    const p = document.createElement('p');
    p.className = className;
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logConsole.appendChild(p);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function calculateLedgerTotal() {
    let total = 0;
    document.querySelectorAll('#ledger-body .row-profit-loss').forEach(cell => {
        const text = cell.textContent.trim();
        if (!text || text === '--.--') return;
        const numeric = parseFloat(text.replace(/[^0-9.+-]/g, ''));
        if (!isNaN(numeric)) total += numeric;
    });
    return total;
}

const pnlToastContainer = document.getElementById('pnl-toast-container');
function showPnlToast(totalValue) {
    if (!pnlToastContainer) return;
    const isWin = totalValue >= 0;

    const existing = pnlToastContainer.querySelector('.pnl-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `pnl-toast ${isWin ? 'pnl-toast-win' : 'pnl-toast-loss'}`;
    toast.innerHTML = `
        <div class="pnl-toast-icon">${isWin ? '\u2713' : '\u2715'}</div>
        <div class="pnl-toast-body">
            <div class="pnl-toast-title">${isWin ? 'Total Profit' : 'Total Loss'}</div>
            <div class="pnl-toast-amount">${isWin ? '+' : ''}${totalValue.toFixed(2)}</div>
        </div>
    `;
    pnlToastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('pnl-toast-visible'));

    setTimeout(() => {
        toast.classList.remove('pnl-toast-visible');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// CHALLENGE 
const CHALLENGE_STORAGE_KEY = 'we_trade_challenge_v1';
const CHALLENGE_LOCK_BUTTON_IDS = [
    'btn-buy-eo', 'btn-toggle-auto-eo',
    'btn-buy-ou', 'btn-toggle-auto-ou',
    'btn-buy-beo', 'btn-toggle-auto-beo',
    'btn-toggle-auto-pou',
    'btn-buy-bulk-over2',
    'btn-buy-tn', 'btn-toggle-auto-tn',
    'btn-buy-ms', 'btn-toggle-auto-ms'
];

const challengeStartCapitalInput = document.getElementById('challenge-start-capital');
const challengeGrowthRateInput = document.getElementById('challenge-growth-rate');
const challengeTotalDaysInput = document.getElementById('challenge-total-days');
const btnStartChallenge = document.getElementById('btn-start-challenge');
const btnResetChallenge = document.getElementById('btn-reset-challenge');
const challengeStatusBanner = document.getElementById('challenge-status-banner');
const challengeProgressDisplay = document.getElementById('challenge-progress-display');
const challengeCurrentDayLabel = document.getElementById('challenge-current-day');
const challengeTotalDaysLabel = document.getElementById('challenge-total-days-label');
const challengeDayProfitLabel = document.getElementById('challenge-day-profit');
const challengeDayTargetLabel = document.getElementById('challenge-day-target');
const challengeProgressFill = document.getElementById('challenge-progress-fill');
const challengeTableBody = document.getElementById('challenge-table-body');

let challengeRows = [];

function defaultChallengeState() {
    return {
        active: false,
        startCapital: 2.00,
        growthRate: 0.20,
        totalDays: 30,
        currentDay: 1,
        dayProfit: 0,
        completedDays: [],
        lockedDate: null   
    };
}

function loadChallengeState() {
    try {
        const raw = localStorage.getItem(CHALLENGE_STORAGE_KEY);
        if (!raw) return defaultChallengeState();
        return { ...defaultChallengeState(), ...JSON.parse(raw) };
    } catch (e) {
        return defaultChallengeState();
    }
}

function saveChallengeState() {
    try { localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(challengeState)); } catch (e) { /* ignore */ }
}

let challengeState = loadChallengeState();

function buildChallengeRows() {
    const rows = [];
    let start = challengeState.startCapital;
    for (let day = 1; day <= challengeState.totalDays; day++) {
        const target = start * challengeState.growthRate;
        const end = start + target;
        rows.push({ day, start, target, end });
        start = end;
    }
    challengeRows = rows;
}

function todayStr() {
    return new Date().toDateString();
}

function isChallengeLocked() {
    return challengeState.active && !!challengeState.lockedDate;
}

function currentChallengeRow() {
    return challengeRows.find(r => r.day === challengeState.currentDay) || null;
}

function checkChallengeDayRollover() {
    if (!challengeState.active || !challengeState.lockedDate) return;
    if (challengeState.lockedDate !== todayStr()) {
        challengeState.currentDay += 1;
        challengeState.dayProfit = 0;
        challengeState.lockedDate = null;
        saveChallengeState();
        applyChallengeLockToButtons(false);
        if (challengeState.currentDay <= challengeState.totalDays) {
            logToConsole(`[Challenge] New trading day \u2014 Day ${challengeState.currentDay} is now unlocked. Good luck.`, "success-msg");
        } else {
            logToConsole(`[Challenge] All ${challengeState.totalDays} days complete! Challenge finished.`, "success-msg");
        }
        renderChallengeUI();
    }
}

function registerChallengeProfit(profitValue) {
    if (!challengeState.active) {
        logToConsole(`[Challenge] Settled amount (${profitValue >= 0 ? '+' : ''}${profitValue.toFixed(2)}) but no challenge is running \u2014 click "Start Challenge" to begin tracking.`, "system-msg");
        return;
    }
    if (isChallengeLocked()) {
        logToConsole(`[Challenge] Settled amount (${profitValue >= 0 ? '+' : ''}${profitValue.toFixed(2)}) but Day ${challengeState.currentDay} is locked \u2014 not counted.`, "system-msg");
        return;
    }
    if (challengeState.currentDay > challengeState.totalDays) return;

    challengeState.dayProfit += profitValue;
    const row = currentChallengeRow();
    logToConsole(`[Challenge] Day ${challengeState.currentDay} P/L now $${challengeState.dayProfit.toFixed(2)} of $${row ? row.target.toFixed(2) : '?'} target.`, "system-msg");
    const dayProfitCents = Math.round(challengeState.dayProfit * 100);
    const targetCents = row ? Math.round(row.target * 100) : Infinity;
    if (row && dayProfitCents >= targetCents) {
        lockChallengeDay(row);
    } else {
        saveChallengeState();
        renderChallengeUI();
    }
}

function lockChallengeDay(row) {
    if (!challengeState.completedDays.includes(row.day)) {
        challengeState.completedDays.push(row.day);
    }
    challengeState.lockedDate = todayStr();
    saveChallengeState();

    haltAllAutoModes();
    applyChallengeLockToButtons(true);

    logToConsole(`[Challenge] Day ${row.day} target of $${row.target.toFixed(2)} reached \u2014 all strategies are now locked until the next trading day.`, "success-msg");
    renderChallengeUI();
}

function applyChallengeLockToButtons(locked) {
    CHALLENGE_LOCK_BUTTON_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (locked) {
            if (el.dataset.preLockDisabled === undefined) {
                el.dataset.preLockDisabled = el.disabled ? "1" : "0";
            }
            el.disabled = true;
            el.classList.add('challenge-locked-btn');
        } else {
            el.classList.remove('challenge-locked-btn');
            if (el.dataset.preLockDisabled === "0") el.disabled = false;
            delete el.dataset.preLockDisabled;
        }
    });
}

function startChallenge() {
    const start = parseFloat(challengeStartCapitalInput.value) || 2;
    const rate = (parseFloat(challengeGrowthRateInput.value) || 20) / 100;
    const days = parseInt(challengeTotalDaysInput.value, 10) || 30;

    challengeState = {
        active: true,
        startCapital: start,
        growthRate: rate,
        totalDays: days,
        currentDay: 1,
        dayProfit: 0,
        completedDays: [],
        lockedDate: null
    };
    saveChallengeState();
    buildChallengeRows();

    challengeStartCapitalInput.disabled = true;
    challengeGrowthRateInput.disabled = true;
    challengeTotalDaysInput.disabled = true;
    btnStartChallenge.disabled = true;

    logToConsole(`[Challenge] Started: $${start.toFixed(2)} start capital, ${(rate * 100).toFixed(0)}% daily target, over ${days} days.`, "success-msg");
    renderChallengeUI();
}

function resetChallenge() {
    if (!confirm("Restart the challenge from Day 1? All progress and ticks will be cleared.")) return;
    challengeState = defaultChallengeState();
    saveChallengeState();
    buildChallengeRows();

    challengeStartCapitalInput.disabled = false;
    challengeGrowthRateInput.disabled = false;
    challengeTotalDaysInput.disabled = false;
    btnStartChallenge.disabled = false;
    applyChallengeLockToButtons(false);

    logToConsole("[Challenge] Reset. Configure your targets and start again whenever you're ready.", "system-msg");
    renderChallengeUI();
}

function renderChallengeUI() {
    if (!challengeTableBody) return;
    if (challengeRows.length === 0) buildChallengeRows();

    if (challengeState.active) {
        challengeStartCapitalInput.value = challengeState.startCapital.toFixed(2);
        challengeGrowthRateInput.value = (challengeState.growthRate * 100).toFixed(0);
        challengeTotalDaysInput.value = challengeState.totalDays;
        challengeStartCapitalInput.disabled = true;
        challengeGrowthRateInput.disabled = true;
        challengeTotalDaysInput.disabled = true;
        btnStartChallenge.disabled = true;
    }

    challengeTableBody.innerHTML = '';
    challengeRows.forEach(row => {
        const tr = document.createElement('tr');
        const isDone = challengeState.completedDays.includes(row.day);
        const isCurrent = challengeState.active && row.day === challengeState.currentDay;
        if (isDone) tr.classList.add('day-complete');
        if (isCurrent) tr.classList.add('day-current');
        if (challengeState.active && row.day > challengeState.currentDay) tr.classList.add('day-locked-future');

        tr.innerHTML = `
            <td>${row.day}</td>
            <td>$${row.start.toFixed(2)}</td>
            <td>$${row.target.toFixed(2)}</td>
            <td>$${row.end.toFixed(2)}</td>
            <td style="text-align:center;">
                <span class="challenge-check ${isDone ? '' : 'pending'}">${isDone ? '\u2714' : '\u2014'}</span>
            </td>
        `;
        challengeTableBody.appendChild(tr);
    });

    if (!challengeState.active) {
        challengeStatusBanner.style.display = 'none';
        challengeProgressDisplay.style.display = 'none';
        return;
    }

    challengeStatusBanner.style.display = 'flex';

    if (challengeState.currentDay > challengeState.totalDays) {
        challengeStatusBanner.className = 'challenge-banner complete';
        challengeStatusBanner.textContent = `\uD83C\uDFC1 Challenge complete \u2014 all ${challengeState.totalDays} days hit their target.`;
        challengeProgressDisplay.style.display = 'none';
        return;
    }

    challengeProgressDisplay.style.display = 'flex';
    const row = currentChallengeRow();
    challengeCurrentDayLabel.textContent = challengeState.currentDay;
    challengeTotalDaysLabel.textContent = challengeState.totalDays;
    challengeDayProfitLabel.textContent = challengeState.dayProfit.toFixed(2);
    challengeDayTargetLabel.textContent = row ? row.target.toFixed(2) : '0.00';
    const pct = row ? Math.max(0, Math.min(100, (challengeState.dayProfit / row.target) * 100)) : 0;
    if (challengeProgressFill) challengeProgressFill.style.width = `${pct}%`;

    if (isChallengeLocked()) {
        challengeStatusBanner.className = 'challenge-banner locked';
        challengeStatusBanner.textContent = `\uD83D\uDD12 Day ${challengeState.currentDay} target hit \u2014 trading is locked until the next trading day.`;
    } else {
        challengeStatusBanner.className = 'challenge-banner active';
        challengeStatusBanner.textContent = `Day ${challengeState.currentDay} in progress \u2014 target is $${row ? row.target.toFixed(2) : '0.00'}.`;
    }
}

// --- LEDGER-DRIVEN SETTLEMENT WATCHER ---
function extractProfitFromLedgerCell(cellEl) {
    if (!cellEl) return null;
    const match = (cellEl.textContent || '').match(/[-+]?\d*\.?\d+/);
    if (!match) return null;
    const value = parseFloat(match[0]);
    return isNaN(value) ? null : value;
}

const challengeBatchExpectedCounts = {};
const challengeBatchAccumulators = {};

function handleLedgerMutations(mutationsList) {
    mutationsList.forEach(mutation => {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') return;
        const cell = mutation.target;
        if (!cell.classList || !(cell.classList.contains('text-win') || cell.classList.contains('text-loss'))) return;
        if (cell.dataset.challengeCounted === '1') return; 

        const profitValue = extractProfitFromLedgerCell(cell);
        cell.dataset.challengeCounted = '1';
        if (profitValue === null) {
            logToConsole("[Challenge] Ledger row settled but its P/L couldn't be read \u2014 not counted.", "error-msg");
            return;
        }

        const row = cell.closest ? cell.closest('tr') : null;
        const batchKey = row ? row.dataset.batchKey : null;

        if (!batchKey) {
            registerChallengeProfit(profitValue);
            return;
        }

        const expected = challengeBatchExpectedCounts[batchKey] || 1;
        const acc = challengeBatchAccumulators[batchKey] || { settled: 0, profitSum: 0 };
        acc.settled += 1;
        acc.profitSum += profitValue;
        challengeBatchAccumulators[batchKey] = acc;

        if (acc.settled >= expected) {
            delete challengeBatchAccumulators[batchKey];
            delete challengeBatchExpectedCounts[batchKey];
            logToConsole(`[Challenge] Batch ${batchKey} fully settled (${expected} leg${expected > 1 ? 's' : ''}), net $${acc.profitSum.toFixed(2)}.`, "system-msg");
            registerChallengeProfit(acc.profitSum);
        }
    });
}

let challengeLedgerObserver = null;
function initChallengeLedgerObserver() {
    if (!ledgerBody || challengeLedgerObserver) return;
    challengeLedgerObserver = new MutationObserver(handleLedgerMutations);
    challengeLedgerObserver.observe(ledgerBody, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
    logToConsole("[Challenge] Now watching the Live Bulk Strategy Ledger for settled trades.", "system-msg");
}

if (btnStartChallenge) btnStartChallenge.addEventListener('click', startChallenge);
if (btnResetChallenge) btnResetChallenge.addEventListener('click', resetChallenge);

buildChallengeRows();
checkChallengeDayRollover();
if (challengeState.active) applyChallengeLockToButtons(isChallengeLocked());
renderChallengeUI();
initChallengeLedgerObserver();
setInterval(checkChallengeDayRollover, 60 * 1000);

(function initQuickNavScrollspy() {
    const navLinks = document.querySelectorAll('.quick-nav-link');
    if (!navLinks.length) return;

    const targets = Array.from(navLinks)
        .map(link => document.querySelector(link.getAttribute('href')))
        .filter(Boolean);

    if (!targets.length || !('IntersectionObserver' in window)) return;

    const linkFor = (id) => document.querySelector(`.quick-nav-link[href="#${id}"]`);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const link = linkFor(entry.target.id);
            if (!link) return;
            if (entry.isIntersecting) {
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    targets.forEach(t => observer.observe(t));
})();
