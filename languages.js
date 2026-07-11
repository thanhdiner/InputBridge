(() => {
  const languages = `
Abkhaz|ab
Acehnese|ace
Acholi|ach
Afrikaans|af
Albanian|sq
Alur|alz
Amharic|am
Arabic|ar
Armenian|hy
Assamese|as
Awadhi|awa
Aymara|ay
Azerbaijani|az
Balinese|ban
Bambara|bm
Bashkir|ba
Basque|eu
Batak Karo|btx
Batak Simalungun|bts
Batak Toba|bbc
Belarusian|be
Bemba|bem
Bengali|bn
Betawi|bew
Bhojpuri|bho
Bikol|bik
Bosnian|bs
Breton|br
Bulgarian|bg
Buryat|bua
Cantonese|yue
Catalan|ca
Cebuano|ceb
Chichewa (Nyanja)|ny
Chinese Simplified|zh-CN
Chinese Traditional|zh-TW
Chuvash|cv
Corsican|co
Crimean Tatar|crh
Croatian|hr
Czech|cs
Danish|da
Dinka|din
Divehi|dv
Dogri|doi
Dombe|dov
Dutch|nl
Dzongkha|dz
English|en
Esperanto|eo
Estonian|et
Ewe|ee
Fijian|fj
Filipino (Tagalog)|fil
Finnish|fi
French|fr
French (France)|fr-FR
French (Canada)|fr-CA
Frisian|fy
Fulfulde|ff
Ga|gaa
Galician|gl
Ganda (Luganda)|lg
Georgian|ka
German|de
Greek|el
Guarani|gn
Gujarati|gu
Haitian Creole|ht
Hakha Chin|cnh
Hausa|ha
Hawaiian|haw
Hebrew|he
Hiligaynon|hil
Hindi|hi
Hmong|hmn
Hungarian|hu
Hunsrik|hrx
Icelandic|is
Igbo|ig
Iloko|ilo
Indonesian|id
Irish|ga
Italian|it
Japanese|ja
Javanese|jv
Kannada|kn
Kapampangan|pam
Kazakh|kk
Khmer|km
Kiga|cgg
Kinyarwanda|rw
Kituba|ktu
Konkani|gom
Korean|ko
Krio|kri
Kurdish (Kurmanji)|ku
Kurdish (Sorani)|ckb
Kyrgyz|ky
Lao|lo
Latgalian|ltg
Latin|la
Latvian|lv
Ligurian|lij
Limburgan|li
Lingala|ln
Lithuanian|lt
Lombard|lmo
Luo|luo
Luxembourgish|lb
Macedonian|mk
Maithili|mai
Makassar|mak
Malagasy|mg
Malay|ms
Malay (Jawi)|ms-Arab
Malayalam|ml
Maltese|mt
Maori|mi
Marathi|mr
Meadow Mari|chm
Meiteilon (Manipuri)|mni-Mtei
Minang|min
Mizo|lus
Mongolian|mn
Myanmar (Burmese)|my
Ndebele (South)|nr
Nepalbhasa (Newari)|new
Nepali|ne
Northern Sotho (Sepedi)|nso
Norwegian|no
Nuer|nus
Occitan|oc
Odia (Oriya)|or
Oromo|om
Pangasinan|pag
Papiamento|pap
Pashto|ps
Persian|fa
Polish|pl
Portuguese|pt
Portuguese (Portugal)|pt-PT
Portuguese (Brazil)|pt-BR
Punjabi|pa
Punjabi (Shahmukhi)|pa-Arab
Quechua|qu
Romani|rom
Romanian|ro
Rundi|rn
Russian|ru
Samoan|sm
Sango|sg
Sanskrit|sa
Scots Gaelic|gd
Serbian|sr
Sesotho|st
Seychellois Creole|crs
Shan|shn
Shona|sn
Sicilian|scn
Silesian|szl
Sindhi|sd
Sinhala (Sinhalese)|si
Slovak|sk
Slovenian|sl
Somali|so
Spanish|es
Sundanese|su
Swahili|sw
Swati|ss
Swedish|sv
Tajik|tg
Tamil|ta
Tatar|tt
Telugu|te
Tetum|tet
Thai|th
Tigrinya|ti
Tsonga|ts
Tswana|tn
Turkish|tr
Turkmen|tk
Twi (Akan)|ak
Ukrainian|uk
Urdu|ur
Uyghur|ug
Uzbek|uz
Vietnamese|vi
Welsh|cy
Xhosa|xh
Yiddish|yi
Yoruba|yo
Yucatec Maya|yua
Zulu|zu
  `.trim().split("\n").map((row) => {
    const separator = row.lastIndexOf("|");
    return Object.freeze({
      name: row.slice(0, separator),
      code: row.slice(separator + 1)
    });
  });

  const popularNames = Object.freeze([
    "English",
    "Vietnamese",
    "Japanese",
    "Korean",
    "Chinese Simplified",
    "Chinese Traditional",
    "Spanish",
    "French",
    "German",
    "Portuguese",
    "Russian",
    "Thai",
    "Indonesian",
    "Italian",
    "Dutch",
    "Polish",
    "Turkish",
    "Hindi",
    "Arabic",
    "Ukrainian"
  ]);

  const aliases = Object.freeze({
    auto: "auto",
    chinese: "zh-CN",
    "chinese simplified": "zh-CN",
    "simplified chinese": "zh-CN",
    "chinese traditional": "zh-TW",
    "traditional chinese": "zh-TW",
    mandarin: "zh-CN",
    "tiếng việt": "vi",
    vietnam: "vi",
    burmese: "my",
    myanmar: "my",
    filipino: "fil",
    tagalog: "fil",
    hebrew: "he",
    iw: "he",
    javanese: "jv",
    jw: "jv",
    oriya: "or",
    odia: "or",
    farsi: "fa",
    gaelic: "gd",
    "scottish gaelic": "gd",
    "punjabi shahmukhi": "pa-Arab",
    "malay jawi": "ms-Arab"
  });

  const byName = Object.create(null);
  const byCode = Object.create(null);
  for (const language of languages) {
    byName[language.name.toLowerCase()] = language.code;
    byCode[language.code.toLowerCase()] = language.name;
  }
  for (const [alias, code] of Object.entries(aliases)) {
    byName[alias.toLowerCase()] = code;
  }

  const popularSet = new Set(popularNames);
  const ordered = Object.freeze([
    ...popularNames.map((name) => languages.find((language) => language.name === name)).filter(Boolean),
    ...languages.filter((language) => !popularSet.has(language.name))
  ]);

  const catalog = {
    languages: Object.freeze(languages),
    ordered,
    popularNames,
    count: languages.length,
    codeFor(value, fallback = "en") {
      const raw = String(value || "").trim();
      if (!raw) return fallback;
      if (/^[a-z]{2,3}(?:-[a-zA-Z]{2,8})*$/.test(raw)) {
        const normalized = raw.toLowerCase();
        const matchingCode = Object.keys(byCode).find((code) => code.toLowerCase() === normalized);
        return matchingCode || raw;
      }
      return byName[raw.toLowerCase()] || fallback;
    },
    nameFor(value, fallback = "Auto") {
      const raw = String(value || "").trim().toLowerCase().replace(/_/g, "-");
      if (!raw) return fallback;
      if (byCode[raw]) return byCode[raw];
      const base = raw.split("-")[0];
      return byCode[base] || fallback;
    }
  };

  globalThis.InputBridgeLanguageCatalog = Object.freeze(catalog);
})();
