(() => {
  const digitsOnly = value => String(value || '').replace(/\D/g, '');
  const selectedCountry = () => {
    const select = document.getElementById('country');
    const iso = select?.selectedOptions?.[0]?.dataset?.iso || select?.value;
    return window.filmgoCountries?.find(country => country.iso === iso) || null;
  };
  const significantDigits = (value, country) => {
    let digits = digitsOnly(value);
    const dial = country?.dial || '';
    if (digits.startsWith('00' + dial)) digits = digits.slice(2 + dial.length);
    else if (digits.startsWith(dial) && digits.length > dial.length + 6) digits = digits.slice(dial.length);
    const prefix = country?.national_prefix || '';
    if (prefix && digits.startsWith(prefix) && digits.length > prefix.length) digits = digits.slice(prefix.length);
    return digits;
  };
  const formatWithTemplate = (template, pattern, digits) => {
    const lengths = [...String(pattern || '').matchAll(/\\d\{(\d+)(?:,\d+)?\}/g)].map(match => Number(match[1]));
    let offset = 0;
    let result = String(template || '');
    lengths.forEach((length, index) => {
      const chunk = digits.slice(offset, offset + length);
      offset += chunk.length;
      result = result.replace('$' + (index + 1), chunk);
    });
    return result.replace(/\$\d+/g, '').replace(/\s+$/g, '').trim();
  };
  const chooseFormat = (country, digits) => {
    const formats = Array.isArray(country?.formats) ? country.formats : [];
    const exact = formats.find(item => {
      const lengths = [...String(item.pattern || '').matchAll(/\\d\{(\d+)(?:,\d+)?\}/g)].map(match => Number(match[1]));
      return lengths.reduce((sum, length) => sum + length, 0) === digits.length && (!item.leading?.length || item.leading.some(value => new RegExp('^(?:' + value + ')').test(digits)));
    });
    if (exact) return exact;
    return formats.find(item => {
      const lengths = [...String(item.pattern || '').matchAll(/\\d\{(\d+)(?:,\d+)?\}/g)].map(match => Number(match[1]));
      return lengths.reduce((sum, length) => sum + length, 0) >= digits.length && (!item.leading?.length || item.leading.some(value => new RegExp('^(?:' + value + ')').test(digits)));
    }) || formats[0] || null;
  };
  const formatLocal = (value, country = selectedCountry()) => {
    const raw = digitsOnly(value);
    if (country?.national_prefix && raw === country.national_prefix) return raw;
    const digits = significantDigits(value, country);
    if (!digits) return '';
    const format = chooseFormat(country, digits);
    if (format) return formatWithTemplate(format.local, format.pattern, digits);
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  };
  const international = (value, country = selectedCountry()) => {
    const local = significantDigits(value, country);
    return local && country?.dial ? '+' + country.dial + local : '';
  };
  const placeholder = country => {
    const format = chooseFormat(country, '');
    if (!format) return 'Phone number';
    const digits = [...String(format.pattern || '').matchAll(/\\d\{(\d+)(?:,\d+)?\}/g)].map(match => '0'.repeat(Number(match[1]))).join('');
    return formatWithTemplate(format.local, format.pattern, digits);
  };
  const localFromInternational = value => {
    const raw = String(value || '').replace(/^\+/, '');
    const country = [...(window.filmgoCountries || [])].sort((a, b) => b.dial.length - a.dial.length).find(item => raw.startsWith(item.dial));
    return formatLocal(raw, country);
  };
  window.FilmGoPhone = { formatLocal, international, placeholder, localFromInternational, selectedCountry };
})();
