(() => {
  const digitsOnly = value => String(value || '').replace(/\D/g, '');
  const selectedCountry = () => {
    const select = document.getElementById('country');
    return window.filmgoCountries?.find(country => country.dial === select?.value) || null;
  };
  const formatLocal = (value, country = selectedCountry()) => {
    let digits = digitsOnly(value);
    const dial = country?.dial || '';
    if (digits.startsWith('00' + dial)) digits = digits.slice(2 + dial.length);
    else if (digits.startsWith(dial) && digits.length > dial.length + 6) digits = digits.slice(dial.length);
    if (country?.iso === 'LK' && digits.length === 10 && digits.startsWith('0')) digits = digits.slice(1);
    const pattern = country?.format || '### ### ### ### ###';
    let offset = 0;
    return pattern.replace(/#+/g, group => {
      const part = digits.slice(offset, offset + group.length);
      offset += part.length;
      return part;
    }).replace(/\s+$/g, '');
  };
  const international = (value, country = selectedCountry()) => {
    const local = formatLocal(value, country).replace(/\D/g, '').replace(/^0+/, '');
    return local && country?.dial ? '+' + country.dial + local : '';
  };
  const placeholder = country => (country?.format || '### ### ### ### ###').replace(/#/g, '0');
  const localFromInternational = value => {
    const raw = String(value || '').replace(/^\+/, '');
    const country = window.filmgoCountries?.find(item => raw.startsWith(item.dial));
    return formatLocal(raw, country);
  };
  window.FilmGoPhone = { formatLocal, international, placeholder, localFromInternational, selectedCountry };
})();
