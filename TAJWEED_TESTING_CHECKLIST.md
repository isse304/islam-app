# Tajweed Colors Testing Checklist
**Date:** January 26, 2026
**Purpose:** Verify accurate tajweed color display after cleanup

---

## 🧪 Test Cases

### Test 1: Al-Fatiha (Surah 1)
**Why:** Most commonly read, contains basic tajweed rules

Expected Tajweed Colors:
- Verse 1: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
  - لَّهِ - **Green** (Shadda on Lam = Ghunnah)
  - الرَّحْمَٰنِ - **Red** (Alif maddah = Madd)
  - الرَّحِيمِ - **Red** (Alif maddah = Madd)

- Verse 2: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ"
  - لِلَّهِ - **Green** (Shadda on Lam = Ghunnah)
  - رَبِّ - **Green** (Shadda = Ghunnah)
  - الْعَالَمِينَ - **Red** (Long vowel = Madd)

### Test 2: Al-Baqarah (Surah 2, Verses 1-5)
**Why:** Contains Madd Lazim and various tajweed rules

Expected Tajweed Colors:
- Verse 1: "الم"
  - Should have **Red** for Madd Lazim (6 beats elongation)

- Verse 2: "ذَٰلِكَ الْكِتَابُ"
  - ذَٰلِكَ - **Red** (Alif maddah)

### Test 3: Al-Ikhlas (Surah 112)
**Why:** Rich in Ghunnah and Qalqalah

Expected Tajweed Colors:
- Verse 1: "قُلْ هُوَ اللَّهُ أَحَدٌ"
  - قُلْ - **Purple** (Qaf with sukun = Qalqalah)
  - اللَّهُ - **Green** (Shadda on Lam = Ghunnah)
  - أَحَدٌ - **Purple** (Dal with sukun = Qalqalah)

- Verse 3: "لَمْ يَلِدْ وَلَمْ يُولَدْ"
  - لَمْ - **Amber** (Meem sakinah before Ya = Ikhfa)
  - يَلِدْ - **Purple** (Dal with sukun = Qalqalah)
  - وَلَمْ - **Amber** (Meem sakinah before Ya = Ikhfa)
  - يُولَدْ - **Purple** (Dal with sukun = Qalqalah)

### Test 4: An-Nas (Surah 114)
**Why:** Multiple tajweed rules in short verses

Expected Tajweed Colors:
- Verse 1: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ"
  - قُلْ - **Purple** (Qaf with sukun = Qalqalah)
  - رَبِّ - **Green** (Shadda = Ghunnah)
  - النَّاسِ - **Green** (Shadda on Noon = Ghunnah)

- Verse 4: "مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ"
  - مِن - **Gray/Amber** (Noon sakinah = Idghaam/Ikhfa depending on next letter)
  - شَرِّ - **Green** (Shadda = Ghunnah)
  - الْخَنَّاسِ - **Green** (Shadda on Noon = Ghunnah)

---

## 🎨 Color Verification Matrix

| Tajweed Rule | Expected Color (Light) | Expected Color (Dark) | Test Pass |
|--------------|----------------------|---------------------|-----------|
| Ghunnah | #4CAF50 (Green) | #66BB6A (Light Green) | [ ] |
| Qalqalah | #9C27B0 (Purple) | #BA68C8 (Light Purple) | [ ] |
| Madd | #F44336 (Red) | #EF5350 (Light Red) | [ ] |
| Idghaam | #757575 (Gray) | #BDBDBD (Light Gray) | [ ] |
| Ikhfa | #FFC107 (Amber) | #FFD54F (Bright Amber) | [ ] |
| Iqlab | #FF9800 (Orange) | #FFB74D (Light Orange) | [ ] |
| Idghaam-Ghunnah | #2196F3 (Blue) | #42A5F5 (Light Blue) | [ ] |
| Hamzat Wasl | #00BCD4 (Cyan) | #26C6DA (Light Cyan) | [ ] |
| Silent | #BDBDBD (Light Gray) | #9E9E9E (Medium Gray) | [ ] |

---

## 🔍 Visual Inspection Checklist

### Light Mode
- [ ] Colors are vibrant and clearly distinguishable
- [ ] Text remains readable with colored letters
- [ ] No letters missing colors that should have them
- [ ] No letters incorrectly colored

### Dark Mode
- [ ] Colors are lighter/brighter than light mode
- [ ] Text-shadow glow effect visible on colored letters
- [ ] Arabic text displays in gold (#B7A57A)
- [ ] Tajweed colors maintain good contrast against dark background

### Toggle Feature
- [ ] Tajweed colors visible when toggle is ON
- [ ] Tajweed colors removed when toggle is OFF
- [ ] Plain Uthmanic text displays correctly when OFF
- [ ] Toggle state persists across page refreshes

---

## 🚨 Known Issues to Watch For

### ❌ FIXED Issues
- ~~Madd colors not showing in light mode~~ (Fixed by adding color property)
- ~~Mixed custom/API implementation~~ (Fixed by removing custom classes)
- ~~Unused mapping functions~~ (Fixed by removing them)

### ✅ Expected Behavior
- Letters with **no** tajweed rules should display in default color (black/gold)
- Pause marks (waqf symbols) should have their own colors (not tajweed colors)
- Word tooltips should work when hovering over colored text

---

## 📝 Test Execution Steps

1. **Start the application**
   ```bash
   npm start
   ```

2. **Navigate to Quran Reader** (`/quran`)

3. **Test Each Surah:**
   - Load Surah 1 (Al-Fatiha)
   - Verify colors match expectations
   - Take screenshot for documentation
   - Repeat for Surahs 2, 112, 114

4. **Test Dark Mode:**
   - Toggle dark mode ON
   - Verify lighter colors and glow effects
   - Take screenshots

5. **Test Tajweed Toggle:**
   - Turn tajweed OFF
   - Verify colors disappear
   - Turn tajweed ON
   - Verify colors reappear

6. **Cross-Browser Testing:**
   - Test in Chrome/Edge
   - Test in Firefox (if available)
   - Test on mobile device (responsive)

---

## 📊 Test Results

### Date: _____________
### Tester: _____________

#### Summary:
- Total Tests: 4 surahs × 2 modes (light/dark) = 8 tests
- Passed: _____ / 8
- Failed: _____ / 8
- Issues Found: __________

#### Notes:
_______________________________
_______________________________
_______________________________

---

## ✅ Sign-Off

After all tests pass:
- [ ] All tajweed colors display correctly
- [ ] No visual bugs or incorrect colors
- [ ] Dark mode optimizations working
- [ ] Toggle feature functional
- [ ] Ready for production use

**Approved By:** _____________
**Date:** _____________
