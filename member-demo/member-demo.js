/* ============================================
   Member Demo Page JS
   ============================================ */

// Demo member data
const demoMember = {
    name: 'محمد أحمد',
    code: 'DEMO-1234',
    level: 'ذهبي',
    wallet: { balance: 2340, pending: 150, totalEarned: 4560, totalWithdrawn: 2220 },
    team: { left: { count: 12, volume: 34500 }, right: { count: 11, volume: 31200 } },
    transactions: [
        { id: 'T001', merchant: 'مطعم الشرق الأوسط', amount: 250, cashback: 25, date: '2024-12-21', status: 'completed' },
        { id: 'T002', merchant: 'سوبرماركت النجمة', amount: 450, cashback: 22.5, date: '2024-12-20', status: 'completed' },
        { id: 'T003', merchant: 'تك لاند', amount: 1200, cashback: 96, date: '2024-12-19', status: 'pending' },
        { id: 'T004', merchant: 'كافيه القمر', amount: 85, cashback: 5.95, date: '2024-12-18', status: 'completed' },
        { id: 'T005', merchant: 'بوتيك الأناقة', amount: 680, cashback: 102, date: '2024-12-17', status: 'completed' }
    ]
};

document.addEventListener('DOMContentLoaded', function () {
    initSidebar();
    loadTransactions();
    initCalculator();
});

function initSidebar() {
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
        item.addEventListener('click', function () {
            const section = this.dataset.section;

            // Update active menu
            menuItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            // Show section
            document.querySelectorAll('.demo-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${section}`).classList.add('active');
        });
    });
}

function loadTransactions() {
    const recentContainer = document.getElementById('recent-transactions');
    const allContainer = document.getElementById('all-transactions');

    // Helper to find merchant image and category icon
    const getMerchantDetails = (merchantName) => {
        // demoMerchants comes from demo-data.js
        if (typeof demoMerchants !== 'undefined') {
            const merchant = demoMerchants.find(m => m.businessName === merchantName);
            if (merchant) {
                return {
                    image: merchant.image ? `../${merchant.image}` : null,
                    icon: merchant.icon || '🏪',
                    categorySlug: merchant.categorySlug
                };
            }
        }
        return { image: null, icon: '🏪', categorySlug: 'services' };
    };

    const transactionsHTML = demoMember.transactions.map(t => {
        const details = getMerchantDetails(t.merchant);

        return `
        <div class="transaction-item">
            <div class="transaction-info">
                ${details.image ?
                `<div class="transaction-icon" style="background: white; overflow: hidden; border: 1px solid #e2e8f0;">
                        <img src="${details.image}" alt="${t.merchant}" style="width: 100%; height: 100%; object-fit: cover;">
                     </div>`
                :
                `<div class="transaction-icon" style="background: ${t.status === 'completed' ? 'var(--preview-accent)' : 'var(--preview-warning)'}">
                        ${details.icon !== '🏪' ? details.icon : (t.status === 'completed' ? '✓' : '⏳')}
                     </div>`
            }
                <div class="transaction-details">
                    <h4>${t.merchant}</h4>
                    <span>${t.date}</span>
                </div>
            </div>
            <div class="transaction-amount">
                <span class="amount-value">${t.amount.toLocaleString('en-US')} ر.س</span>
                <span class="cashback-value">+${t.cashback.toLocaleString('en-US')} نقاط</span>
                <span class="status-badge ${t.status}">${t.status === 'completed' ? 'مكتمل' : 'قيد المعالجة'}</span>
            </div>
        </div>
    `}).join('');

    if (recentContainer) {
        recentContainer.innerHTML = transactionsHTML;
    }

    if (allContainer) {
        allContainer.innerHTML = transactionsHTML;
    }
}

function initCalculator() {
    const amountInput = document.getElementById('calc-amount');
    const rateInput = document.getElementById('calc-rate');
    const resultEl = document.getElementById('calc-result');

    function calculate() {
        const amount = parseFloat(amountInput.value) || 0;
        const rate = parseFloat(rateInput.value) || 0;
        const cashback = (amount * rate / 100).toFixed(2);
        resultEl.textContent = `${parseFloat(cashback).toLocaleString('en-US')} ر.س`;
    }

    amountInput.addEventListener('input', calculate);
    rateInput.addEventListener('input', calculate);
    calculate();
}

function copyReferralLink() {
    const input = document.getElementById('referral-link');
    input.select();
    document.execCommand('copy');
    showToast('تم نسخ رابط الإحالة بنجاح!');
}

function simulateWithdraw() {
    showToast('هذه ميزة تجريبية - سجّل للوصول الكامل');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
