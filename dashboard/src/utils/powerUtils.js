export const parsePowerInput = (val) => {
    if (!val) return 0;
    let str = val.toString().toUpperCase().replace(/,/g, '').replace(/ /g, '');
    let multiplier = 1;

    if (str.endsWith('K')) { multiplier = 1000; str = str.slice(0, -1); }
    else if (str.endsWith('M')) { multiplier = 1000000; str = str.slice(0, -1); }
    else if (str.endsWith('B')) { multiplier = 1000000000; str = str.slice(0, -1); }

    const num = parseFloat(str);
    if (isNaN(num)) return 0;
    return Math.round(num * multiplier);
};

export const formatPower = (num) => {
    if (!num) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(2).replace(/\.00$/, '') + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
};
