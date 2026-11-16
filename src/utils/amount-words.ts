const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
    const parts: string[] = [];
    if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
    if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')); }
    else if (n > 0) parts.push(ONES[n]);
    return parts.join(' ');
}

/** 1,25,000 -> "One Lakh Twenty Five Thousand" (Indian grouping) */
function wholeInWords(n: number): string {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000); n %= 10_000_000;
    const lakh = Math.floor(n / 100_000); n %= 100_000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${below1000(crore)} Crore`);
    if (lakh) parts.push(`${below1000(lakh)} Lakh`);
    if (thousand) parts.push(`${below1000(thousand)} Thousand`);
    if (n) parts.push(below1000(n));
    return parts.join(' ');
}

/** 12500.5 -> "Rupees Twelve Thousand Five Hundred and Fifty Paise Only" */
export function rupeesInWords(amount: number): string {
    const cents = Math.round(Math.max(0, amount) * 100);
    const rupees = Math.floor(cents / 100);
    const paise = cents % 100;
    return `Rupees ${wholeInWords(rupees)}${paise ? ` and ${wholeInWords(paise)} Paise` : ''} Only`;
}
