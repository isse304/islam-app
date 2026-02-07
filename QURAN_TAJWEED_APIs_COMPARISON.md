# Quran Tajweed APIs - Comprehensive Comparison
**Date:** January 26, 2026
**Purpose:** Compare available APIs that provide Quranic text with tajweed colors

---

## 🌐 Available APIs

### 1. ✅ Quran.com API v4 (CURRENTLY USING - RECOMMENDED)

**Base URL:** `https://api.quran.com/api/v4/`

**Tajweed Endpoint:**
```
GET /verses/by_chapter/{chapter_id}
```

**Query Parameters:**
```
language=en
words=true
word_fields=text_uthmani,text_uthmani_tajweed,translation,transliteration,char_type_name
translation_fields=text
translations={translation_id}
fields=text_uthmani,chapter_id,verse_number
per_page=300
```

**Tajweed Field:** `word.text_uthmani_tajweed`

**Format:** HTML with `<rule class="tajweed_class">letter</rule>` tags

**Example Response:**
```json
{
  "verses": [{
    "verse_number": 1,
    "words": [{
      "text_uthmani": "ٱلْحَمْدُ",
      "text_uthmani_tajweed": "<rule class=\"ham_wasl\">ٱ</rule>لْحَمْدُ",
      "translation": { "text": "All praise" }
    }]
  }]
}
```

**Pros:**
- ✅ Most widely used and trusted source
- ✅ Accurate tajweed verified by scholars
- ✅ Well-maintained with active development
- ✅ Free with no authentication required
- ✅ Fast CDN delivery
- ✅ Used by millions of Muslims worldwide
- ✅ Comprehensive documentation
- ✅ Multiple recitation, translation, and tafsir options
- ✅ Word-by-word data included
- ✅ Audio timestamps for word-level synchronization

**Cons:**
- ⚠️ Returns HTML (not structured data) for tajweed
- ⚠️ Class names not fully documented
- ⚠️ Some variations in class naming (e.g., qalqalah vs qalaqalah)

**Tajweed Classes Returned:**
- `ghunnah`, `ghunnah_shown`, `ghunnah_hidden`
- `qalqalah`, `qalaqalah`
- `madd`, `madd_2`, `madd_6`, `madd_24`, `madd_muttasil`, `madd_munfasil`, `madd_lazim`
- `madda_normal`, `madda_permissible`, `madda_necessary`, `madda_obligatory`
- `idgham`, `idghaam`, `idgham_wo_ghunnah`, `idgham_w_ghunnah`
- `ikhfa`, `ikhfaa`, `ikhfa_shafawi`
- `iqlab`, `iqlb`
- `izhar`, `izhar_shafawi`
- `ham_wasl`, `hamzat_wasl`
- `slnt`, `silent`

**Documentation:** https://api-docs.quran.com/

**Status:** ✅ **RECOMMENDED - CURRENT IMPLEMENTATION**

---

### 2. Quran Foundation API (QuranCDN)

**Base URL:** `https://api.qurancdn.com/api/qdc/`

**Tajweed Endpoint:**
```
GET /verses
```

**Query Parameters:**
```
chapter_number={chapter}
verse_number={verse}
words=true
word_fields=text_uthmani_tajweed,v1_page,text_uthmani
```

**Tajweed Field:** `word.text_uthmani_tajweed`

**Format:** Similar HTML format to Quran.com

**Example:**
```json
{
  "verses": [{
    "words": [{
      "text_uthmani": "ٱلْحَمْدُ",
      "text_uthmani_tajweed": "<tajweed class=\"ham_wasl\">ٱ</tajweed>لْحَمْدُ"
    }]
  }]
}
```

**Pros:**
- ✅ Good documentation
- ✅ Similar structure to Quran.com API
- ✅ Free to use
- ✅ Reliable CDN

**Cons:**
- ⚠️ Less widely adopted than Quran.com
- ⚠️ May use `<tajweed>` tag instead of `<rule>` tag
- ⚠️ Would require CSS changes to support
- ⚠️ Fewer community resources

**Documentation:** https://api-docs.quran.foundation/

**Status:** ⚠️ **ALTERNATIVE OPTION** (would require code changes)

---

### 3. ❌ AlQuran Cloud API

**Base URL:** `https://api.alquran.cloud/v1/`

**Verse Endpoint:**
```
GET /ayah/{ayah_reference}
GET /surah/{surah_number}
```

**Editions Available:**
- `quran-uthmani` - Plain Uthmanic text
- Various translations
- Various audio reciters

**Tajweed Support:** ❌ **NONE**

**Example Response:**
```json
{
  "data": {
    "text": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ",
    "numberInSurah": 2
  }
}
```

**Pros:**
- ✅ Simple, clean API
- ✅ Multiple editions
- ✅ Good for basic Quran text
- ✅ Free with no auth

**Cons:**
- ❌ **NO TAJWEED DATA PROVIDED**
- ❌ Plain text only
- ❌ Would require custom tajweed detection (error-prone)

**Documentation:** https://alquran.cloud/api

**Status:** ❌ **NOT SUITABLE** for tajweed colors

---

### 4. Tanzil.net API

**Base URL:** `https://api.tanzil.net/`

**Format:** XML or plain text

**Editions:**
- Multiple Quranic text versions
- Various translations

**Tajweed Support:** ❌ **NONE**

**Pros:**
- ✅ Authoritative Quranic text
- ✅ Multiple text versions (Uthmani, Simple)
- ✅ Free to use

**Cons:**
- ❌ **NO TAJWEED ANNOTATIONS**
- ❌ XML format (more complex to parse)
- ❌ Less modern API design

**Documentation:** https://tanzil.net/docs/

**Status:** ❌ **NOT SUITABLE** for tajweed colors

---

### 5. Custom Machine Learning Solution

**Approach:** Build custom tajweed detection using:
- Arabic NLP libraries
- Rule-based pattern matching
- Unicode diacritic analysis
- Machine learning models

**Example Libraries:**
- CAMeL Tools (Arabic NLP)
- pyarabic (Python)
- arabic.js (JavaScript)

**Implementation Effort:**
```
High: 40-80 hours of development
```

**Pros:**
- ✅ Full control over logic
- ✅ No API dependency
- ✅ Offline support possible

**Cons:**
- ❌ **HIGH RISK OF ERRORS** - Tajweed is complex
- ❌ Requires deep tajweed expertise
- ❌ Need to maintain rule database
- ❌ Testing required for all 6,236 verses
- ❌ Scholarly verification needed
- ❌ Updates needed as rules clarified
- ❌ Potential for incorrect colors (unacceptable for Quran)

**Status:** ❌ **NOT RECOMMENDED** - Too risky for religious text

---

## 📊 Comparison Matrix

| Feature | Quran.com v4 | Quran Foundation | AlQuran Cloud | Tanzil | Custom ML |
|---------|--------------|------------------|---------------|---------|-----------|
| **Tajweed Data** | ✅ HTML tags | ✅ HTML tags | ❌ None | ❌ None | ⚠️ Custom |
| **Accuracy** | ✅ Scholar-verified | ✅ Scholar-verified | N/A | N/A | ❌ Uncertain |
| **Maintenance** | ✅ Active | ✅ Active | ✅ Active | ⚠️ Moderate | ❌ Self |
| **Documentation** | ✅ Excellent | ✅ Good | ✅ Good | ⚠️ Basic | N/A |
| **Adoption** | ✅ Very High | ⚠️ Moderate | ✅ High | ⚠️ Low | N/A |
| **Cost** | ✅ Free | ✅ Free | ✅ Free | ✅ Free | ⚠️ Dev time |
| **Auth Required** | ✅ No | ✅ No | ✅ No | ✅ No | N/A |
| **Rate Limits** | ✅ Generous | ⚠️ Unknown | ✅ Good | ⚠️ Unknown | ✅ None |
| **CDN Speed** | ✅ Fast | ✅ Fast | ✅ Fast | ⚠️ Moderate | ✅ Local |
| **Word-by-Word** | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ⚠️ Custom |
| **Audio Support** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **Translation** | ✅ Multiple | ✅ Multiple | ✅ Multiple | ✅ Yes | ❌ No |

---

## 🏆 Recommendation

### **Use Quran.com API v4** ✅

**Reasons:**

1. **Accuracy:** Scholar-verified tajweed rules
2. **Reliability:** Used by millions, battle-tested
3. **Trust:** Community standard for Quranic data
4. **Maintenance:** Active development team
5. **Features:** Comprehensive word-level data
6. **Performance:** Fast CDN delivery
7. **Support:** Large community, good documentation

### **Why Not Others?**

- **Quran Foundation:** Good alternative but less adopted, would require code changes
- **AlQuran Cloud:** ❌ No tajweed data
- **Tanzil:** ❌ No tajweed data, older API design
- **Custom ML:** ❌ Too risky for religious text, high error potential

---

## 🔄 Migration Guide (If Switching)

### From Quran.com to Quran Foundation:

**Step 1:** Update API endpoint in `quran.service.ts`
```typescript
private quranComUrl = 'https://api.qurancdn.com/api/qdc';
```

**Step 2:** Update API call parameters
```typescript
const url = `${this.quranComUrl}/verses?chapter_number=${surahNumber}...`;
```

**Step 3:** Update CSS if they use `<tajweed>` tags instead of `<rule>`
```scss
tajweed[class*="ghunnah"] {
  color: #4CAF50 !important;
}
```

**Step 4:** Test thoroughly across all surahs

**Estimated Effort:** 2-4 hours

**Recommended?** ⚠️ **NO** - Stick with Quran.com unless there's a specific reason to switch

---

## 🔍 API Selection Criteria

When choosing a Quran API with tajweed support, consider:

### 1. **Accuracy (CRITICAL)**
- ✅ Scholar-verified tajweed rules
- ✅ Trusted by Islamic institutions
- ✅ Used in production by major apps

### 2. **Completeness**
- ✅ All 114 surahs
- ✅ All 6,236 verses
- ✅ Word-level data
- ✅ Multiple tajweed rules covered

### 3. **Format**
- ✅ Easy to parse and render
- ✅ Structured data
- ✅ HTML tags or JSON markup

### 4. **Performance**
- ✅ Fast response times (<500ms)
- ✅ CDN delivery
- ✅ Caching support
- ✅ Reasonable rate limits

### 5. **Maintenance**
- ✅ Active development
- ✅ Bug fixes and updates
- ✅ Community support
- ✅ Long-term viability

### 6. **Integration**
- ✅ Good documentation
- ✅ Easy to implement
- ✅ Minimal dependencies
- ✅ Standard formats (JSON, HTML)

---

## 📝 Implementation Notes

### Current Implementation (Quran.com v4):

**Data Flow:**
```
API Request → Response with text_uthmani_tajweed → [innerHTML] binding → CSS styling
```

**Rendering:**
```html
<!-- API returns: -->
<rule class="ham_wasl">ٱ</rule>لْحَمْدُ

<!-- CSS applies: -->
rule[class*="ham_wasl"] { color: #00BCD4; }

<!-- User sees: -->
ٱلْحَمْدُ (with cyan colored ٱ)
```

**Advantages:**
- ✅ Simple rendering (direct HTML binding)
- ✅ No parsing required
- ✅ CSS handles all styling
- ✅ Easy to customize colors

**Security:**
- ⚠️ HTML injection risk (mitigated by SafeHtmlPipe)
- ✅ Content from trusted API only
- ✅ No user-generated content

---

## 🚀 Future Considerations

### Potential Enhancements:

1. **Fallback API:**
   - Use Quran Foundation as backup if Quran.com fails
   - Implement automatic failover

2. **Offline Support:**
   - Cache tajweed data in IndexedDB
   - Download entire Quran for offline use
   - Requires ~50MB storage

3. **Custom Color Schemes:**
   - Allow users to customize tajweed colors
   - Preset themes (high contrast, colorblind-friendly)
   - Store preferences in user profile

4. **Performance Optimization:**
   - Pre-fetch next surah
   - Aggressive caching strategy
   - Service Worker for offline access

5. **Enhanced Tajweed:**
   - Show rule explanations on hover
   - Interactive tajweed learning mode
   - Audio with tajweed highlighting

---

## 📚 Resources

### Documentation:
- **Quran.com API:** https://api-docs.quran.com/
- **Quran Foundation:** https://api-docs.quran.foundation/
- **Tajweed Rules:** https://quran.com/tajweed

### Community:
- **Quran.com GitHub:** https://github.com/quran/quran.com-frontend
- **API Issues:** https://github.com/quran/quran.com-api/issues
- **Discord:** Quran.com community server

### Learning:
- **Tajweed Guide:** https://www.alnooronline.org/tajweed
- **Color Coding:** https://tarteel.ai/tajweed-guide
- **Rules Explanation:** https://www.learntajweed.com/

---

## ✅ Conclusion

**Current Choice:** Quran.com API v4 ✅

**Confidence:** HIGH

**Reasoning:** 
- Most trusted and accurate source
- Used by major Islamic apps
- Comprehensive tajweed coverage
- Excellent performance and reliability
- No better alternative exists

**Action Required:** ✅ **NONE** - Continue using Quran.com API

---

**Last Updated:** January 26, 2026
**Next Review:** When API v5 is released (monitor GitHub)
