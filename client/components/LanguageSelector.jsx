import React, { useState, useEffect, useRef } from "react";
import "./../styles/LanguageSelector.css";

const LanguageSelector = ({ selectedLang, onChange }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const languages = [
    { code: "es-MX", name: "Español (México)", flag: "MX" },
    { code: "es-CO", name: "Español (Colombia)", flag: "CO" },
    { code: "es-AR", name: "Español (Argentina)", flag: "AR" },
    { code: "es-ES", name: "Español (España)", flag: "ES" },
    { code: "en-US", name: "English (US)", flag: "US" },
    { code: "pt-BR", name: "Português (Brasil)", flag: "BR" },
    { code: "fr-FR", name: "Français (France)", flag: "FR" },
  ];

  //https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/index.json

  const currentLang = languages.find(lang => lang.code === selectedLang);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (code) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className="language-selector">
      <button className="language-button" onClick={() => setOpen(!open)}>
        <img
          src={`https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/${currentLang.flag}.svg`}
          alt={currentLang.name}
          className="flag-icon"
        />
        <span className="lang-code">{currentLang.flag}</span>
      </button>

      {open && (
        <div className={"language-dropdown"}>
          {languages.map(lang => (
            <div
              key={lang.code}
              className={`dropdown-item ${lang.code === selectedLang ? "active" : ""}`}
              onClick={() => handleSelect(lang.code)}
            >
              <img src={`https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/${lang.flag}.svg`} alt={lang.name} className="flag-icon" />
              <span>{lang.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
