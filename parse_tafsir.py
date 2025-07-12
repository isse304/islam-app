import re
import json

def parse_tafsir_by_surah(input_file, output_file):
    """
    Parses a large markdown file containing Tafsir and structures it
    by Surah into a JSON file. It will treat all text following a Surah
    heading as belonging to that Surah until the next Surah heading is found.
    """
    print(f"Reading markdown file: {input_file}")
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: Input file not found at {input_file}")
        return

    print("Parsing content by Surah...")
    structured_data = []
    
    # Regex to find Surah headings, based on the user-provided snippet.
    # It looks for '#### **Surat ...**'
    surah_pattern = re.compile(r"^\s*####\s*\*\*\s*Surat\s+(.*?)\s*\*\*", re.IGNORECASE)
    
    current_surah_name = None
    current_surah_text = ""

    lines = content.splitlines()

    for line in lines:
        surah_match = surah_pattern.match(line)
        
        if surah_match:
            # If we find a new Surah, save the previous one's data
            if current_surah_name:
                structured_data.append({
                    "surah": current_surah_name,
                    "text": current_surah_text.strip()
                })
                print(f"  - Stored Tafsir for Surah {current_surah_name}")

            # Start the new Surah
            current_surah_name = surah_match.group(1).strip()
            current_surah_text = ""
            print(f"Found Surah: {current_surah_name}")
        elif current_surah_name:
            # If we are inside a Surah, append the line to its text
            # We'll also try to filter out the garbled Arabic and symbols
            
            # Simple filter to remove lines that look like garbled Arabic or symbols
            # This can be improved, but it's a start
            if ' তালে' in line or '∇' in line or '∑' in line or 'ц' in line:
                continue
            
            # Remove the known #### heading from duplicated content
            cleaned_line = line.replace("####", "").strip()
            current_surah_text += cleaned_line + "\n"

    # Add the last Surah to the list after the loop finishes
    if current_surah_name:
        structured_data.append({
            "surah": current_surah_name,
            "text": current_surah_text.strip()
        })
        print(f"  - Stored Tafsir for Surah {current_surah_name}")

    print(f"\nSuccessfully parsed {len(structured_data)} Surahs.")

    # Clean up empty entries if any
    structured_data = [item for item in structured_data if item["text"].strip()]

    print(f"Writing structured data to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(structured_data, f, indent=2, ensure_ascii=False)

    print("Parsing complete.")

if __name__ == "__main__":
    input_md = r"src/assets/data/tafsir-ibn-kathir-markdown.md"
    output_json = r"src/assets/data/tafsir_structured.json"
    parse_tafsir_by_surah(input_md, output_json) 