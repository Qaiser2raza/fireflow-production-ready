import * as fs from 'fs';

const filePath = 'src/operations/finance/FinancialCommandCenter.tsx';
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Add imports
if (!code.includes("import { AccountLedgerModal }")) {
    code = code.replace(
        "import { DaybookReviewModal } from './components/DaybookReviewModal';",
        "import { DaybookReviewModal } from './components/DaybookReviewModal';\nimport { AccountLedgerModal } from './components/AccountLedgerModal';"
    );
}

// 2. Add states
if (!code.includes("const [activeTab, setActiveTab] = useState('overview');")) {
    code = code.replace(
        "const [showDaybookReviewModal, setShowDaybookReviewModal] = useState(false);",
        "const [showDaybookReviewModal, setShowDaybookReviewModal] = useState(false);\n    const [activeTab, setActiveTab] = useState('overview');\n    const [ledgerAccount, setLedgerAccount] = useState<{id: string, code: string, name: string} | null>(null);"
    );
}

// 3. Reorganize JSX
const headerEndIndex = code.indexOf('{/* ── SESSION STATUS BAR ───────────────────────────── */}');
const actionsEndIndex = code.indexOf('{showOpenModal && (');

if (headerEndIndex === -1 || actionsEndIndex === -1) {
    console.error("Could not find sections");
    process.exit(1);
}

const beforeHeaderEnd = code.substring(0, headerEndIndex);
const afterActionsEnd = code.substring(actionsEndIndex);
const bodyContent = code.substring(headerEndIndex, actionsEndIndex);

// Extract the 4 sections from bodyContent
const sessionStatusBarIdx = bodyContent.indexOf('{/* ── SESSION STATUS BAR ───────────────────────────── */}');
const kpiCardsIdx = bodyContent.indexOf('{/* ── 3 KPI CARDS ────────────────────────────────────── */}');
const ledgerSectionIdx = bodyContent.indexOf('{/* Detailed Ledger Section */}');
const actionsBarIdx = bodyContent.indexOf('{/* ── ACTIONS BAR ──────────────────────────────────── */}');

const sessionStatusBar = bodyContent.substring(sessionStatusBarIdx, kpiCardsIdx);
const kpiCards = bodyContent.substring(kpiCardsIdx, ledgerSectionIdx);
const ledgerSection = bodyContent.substring(ledgerSectionIdx, actionsBarIdx);

// Construct new JSX
const tabJSX = `
            {/* ── TABS ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-2">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'accounts', label: 'Cash & Accounts' },
                    { id: 'ledger', label: 'Ledger' },
                    { id: 'reports', label: 'Reports' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={\`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all \${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600'}\`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    ${sessionStatusBar.trim()}
                    ${kpiCards.trim()}
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-800/70">
                        <button
                            onClick={() => setShowManualJournalModal(true)}
                            className="px-5 py-2.5 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600/20 hover:text-indigo-300 transition-all flex items-center gap-2"
                        >
                            <FileEdit size={14} strokeWidth={3} /> Post Journal
                        </button>
                        <button
                            onClick={() => setShowTrialBalanceModal(true)}
                            className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-blue-400 rounded-xl font-black text-xs uppercase tracking-widest hover:border-blue-500/40 hover:text-blue-300 transition-all flex items-center gap-2"
                        >
                            <FileText size={14} strokeWidth={3} /> Trial Balance
                        </button>
                        <button
                            onClick={handleViewHistory}
                            className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl font-black text-xs uppercase tracking-widest hover:border-slate-600 hover:text-white transition-all flex items-center gap-2"
                        >
                            <History size={14} strokeWidth={3} /> Z-Report
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'accounts' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="grid grid-cols-3 gap-5">
                        {[
                            { code: '1000', title: 'Cashier Till' },
                            { code: '1090', title: 'Manager Safe' },
                            { code: '1100', title: 'Bank Account' }
                        ].map(accConfig => {
                            const acc = coaAccounts.find((a: any) => a.code === accConfig.code);
                            const balance = Number(acc?.balance || 0);
                            return (
                                <div 
                                    key={accConfig.code}
                                    onClick={() => {
                                        if (acc) setLedgerAccount({ id: acc.id, code: acc.code, name: acc.name });
                                    }}
                                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all group"
                                >
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3">{accConfig.title}</p>
                                    <h2 className="text-4xl font-black text-white tracking-tight mb-1 group-hover:text-indigo-400 transition-colors">
                                        <span className="text-slate-600 text-base font-normal mr-1">Rs.</span>{balance.toLocaleString()}
                                    </h2>
                                    <p className="text-[10px] text-slate-500">Net GL balance (Acc: {accConfig.code})</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-5 mt-2">
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Supplier Payable (2020)</span>
                            <span className="text-rose-400 font-mono font-bold">Rs. {Number(coaAccounts.find((a: any) => a.code === '2020')?.balance || 0).toLocaleString()}</span>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Customer AR (1040)</span>
                            <span className="text-emerald-400 font-mono font-bold">Rs. {Number(coaAccounts.find((a: any) => a.code === '1040')?.balance || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ledger' && (
                <div className="flex-1 overflow-hidden flex flex-col animate-in fade-in duration-300">
                    ${ledgerSection.trim()}
                </div>
            )}

            {activeTab === 'reports' && (
                <div className="animate-in fade-in duration-300">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { title: 'Daily Sales', endpoint: '/api/reports/daily-sales', icon: FileText },
                            { title: 'Tax Liability', endpoint: '/api/reports/tax-liability', icon: FileText },
                            { title: 'Staff', endpoint: '/api/reports/staff-performance', icon: Users },
                            { title: 'Payment Methods', endpoint: '/api/reports/payment-methods', icon: FileText },
                            { title: 'Product Mix', endpoint: '/api/reports/product-mix', icon: FileText },
                            { title: 'Loss Prevention', endpoint: '/api/reports/loss-prevention', icon: ShieldCheck },
                            { title: 'Rider Audit', endpoint: '/api/reports/rider-audit', type: 'rider-audit', icon: FileText },
                        ].map((r: any) => (
                            <button
                                key={r.title}
                                onClick={() => { setPreviewReport(r); handleFetchReport(r.endpoint, r.title); }}
                                className="p-6 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-purple-500/40 hover:text-purple-400 transition-all flex flex-col items-center justify-center gap-3 aspect-video"
                            >
                                <r.icon size={20} className="mb-1" />
                                {r.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}
`;

const newCode = beforeHeaderEnd + tabJSX + '\n' + afterActionsEnd;

// Add AccountLedgerModal at the end
const finalCode = newCode.replace(
    'export default FinancialCommandCenter;',
    `
            {ledgerAccount && (
                <AccountLedgerModal
                    isOpen={!!ledgerAccount}
                    onClose={() => setLedgerAccount(null)}
                    accountId={ledgerAccount.id}
                    accountCode={ledgerAccount.code}
                    accountName={ledgerAccount.name}
                    dateFrom={useRange ? startDate : selectedDate}
                    dateTo={useRange ? endDate : selectedDate}
                />
            )}
export default FinancialCommandCenter;`
);

fs.writeFileSync(filePath, finalCode, 'utf-8');
console.log('Done refactoring!');
