import os
import subprocess
import shutil

total_pages = 5698
chunk_size = 250
pdf_path = r"C:\Users\qadar\Desktop\Tafsir Ibn Kathir all 10 volumes.pdf"
# The chunks will now be created inside a subdirectory named after the PDF
output_dir_base = r"C:\Users\qadar\Desktop\IslamApp\src\assets\data\chunks"
final_output_dir = r"C:\Users\qadar\Desktop\IslamApp\src\assets\data"
final_filename = "tafsir-ibn-kathir-markdown.md"
marker_path = r"C:\Users\qadar\AppData\Roaming\Python\Python312\Scripts\marker_single.exe"
pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]

# Create base chunks directory if it doesn't exist
os.makedirs(output_dir_base, exist_ok=True)

# --- Process in chunks ---
print("Starting PDF conversion in chunks with forced OCR...")
all_chunks_processed_successfully = True
for start_page in range(0, total_pages, chunk_size):
    end_page = min(start_page + chunk_size - 1, total_pages - 1)
    page_range = f"{start_page}-{end_page}"
    
    # Create a unique filename for each chunk's output
    chunk_output_filename = f"chunk_{page_range}.md"
    # The output directory for marker will be the base one
    # but we will rename the file it creates.
    
    print(f"Processing pages: {page_range}...")

    command = [
        marker_path,
        pdf_path,
        "--output_dir", output_dir_base, # Marker creates a subdir here
        "--page_range", page_range,
        "--disable_image_extraction",
        "--force_ocr" # Force OCR to try and fix text issues
    ]

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            print(f"Successfully processed pages {page_range}")
            # After processing, rename the generic output file to our unique chunk name
            pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
            generated_dir = os.path.join(output_dir_base, pdf_basename)
            original_output_file = os.path.join(generated_dir, f"{pdf_basename}.md")
            new_chunk_file = os.path.join(generated_dir, chunk_output_filename)

            if os.path.exists(original_output_file):
                os.rename(original_output_file, new_chunk_file)
                print(f"Renamed output to {chunk_output_filename}")
            else:
                print(f"Warning: Expected output file not found at {original_output_file}")

        else:
            print(f"Error processing pages {page_range}:")
            print(stderr)
            all_chunks_processed_successfully = False
            break 
    except Exception as e:
        print(f"A critical error occurred while processing pages {page_range}: {e}")
        all_chunks_processed_successfully = False
        break

if not all_chunks_processed_successfully:
    print("\nAborting script due to errors during chunk processing.")
    print("The 'chunks' directory has been kept for inspection.")
else:
    print("\nAll chunks have been processed.")

    # --- Merge files ---
    pdf_basename = os.path.splitext(os.path.basename(pdf_path))[0]
    chunks_dir_final = os.path.join(output_dir_base, pdf_basename)

    print("Merging markdown files...")
    merged_filepath = os.path.join(final_output_dir, final_filename)

    try:
        all_files_in_chunks_dir = os.listdir(chunks_dir_final)
        print(f"Files found in chunks directory: {all_files_in_chunks_dir}")

        chunk_files = [f for f in all_files_in_chunks_dir if f.startswith("chunk_") and f.endswith(".md")]
        
        if not chunk_files:
            print("Error: No markdown files found to merge.")
        else:
            def get_start_page_from_filename(filename):
                try:
                    name_part = os.path.splitext(filename)[0]
                    page_part = name_part.split('_')[1]
                    start_num_str = page_part.split('-')[0]
                    return int(start_num_str)
                except (IndexError, ValueError):
                    print(f"Warning: Could not parse page number from '{filename}'. Using alphabetical sorting.")
                    return filename

            chunk_files.sort(key=get_start_page_from_filename)
            print(f"Sorted markdown files to be merged: {chunk_files}")

            with open(merged_filepath, 'w', encoding='utf-8') as outfile:
                for chunk_file in chunk_files:
                    chunk_filepath = os.path.join(chunks_dir_final, chunk_file)
                    with open(chunk_filepath, 'r', encoding='utf-8') as infile:
                        outfile.write(infile.read())
                        outfile.write("\n\n")
            
            print(f"Successfully merged all chunks into {merged_filepath}")

            # --- Clean up ---
            print("\nCleanup of chunks directory is disabled for debugging.")
            print("Please manually delete the 'src/assets/data/chunks' directory when you are done.")

    except Exception as e:
        print(f"\nAn error occurred during the merge or cleanup process: {e}")
        print("The temporary files in 'src/assets/data/chunks' have been preserved for inspection.")

print("\nScript finished.") 