# bash -c "/Users/user/batchprompt/terminal_command.sh"
# ------------------------------------------------------------------------------------------------
rm -f "/Users/user/.cache.sqlite"
# ------------------------------------------------------------------------------------------------
# ------------------------------------------------------------------------------------------------
echo "Let's go!"
# ------------------------------------------------------------------------------------------------
batchprompt generate \
  "/Users/user/batchprompt/text-input/test.csv" \
  "/Users/user/batchprompt/text-input/00_Markdown.md" \
  "/Users/user/batchprompt/text-input/01_newFeaturesSection.md" \
  "/Users/user/batchprompt/text-input/02_featuresSection.md" \
  "/Users/user/batchprompt/text-input/03_yourBenefits.md" \
  "/Users/user/batchprompt/text-input/04_aboutCourse_first_second.md" \
  "/Users/user/batchprompt/text-input/05_heroSection.md" \
  --output "/Users/user/batchprompt/text-output/{{id}}_{{industry}}/output.md" \
  --concurrency 10 \
  --model google/gemini-3-pro-preview
# ------------------------------------------------------------------------------------------------
sleep 1
# ------------------------------------------------------------------------------------------------
# Set the base directory
BASE_DIR="/Users/user/batchprompt/text-output"

# Check if the base directory exists
if [ ! -d "$BASE_DIR" ]; then
    echo "Error: Directory $BASE_DIR does not exist"
    exit 1
fi

# Iterate through each subdirectory in the base directory
for folder in "$BASE_DIR"/*/; do
    # Remove trailing slash and get the folder name
    folder_name=$(basename "$folder")

    # Check if the required files exist
    if [ -f "$folder/output_2.md" ] &&
       [ -f "$folder/output_3.md" ] &&
       [ -f "$folder/output_4.md" ] &&
       [ -f "$folder/output_5.md" ] &&
       [ -f "$folder/output_6.md" ]; then

        # Create the final file using the folder name
        final_file="$folder/${folder_name}.md"

        # Combine files in the specified order with empty lines between
        # No empty line before output_6.md
        cat "$folder/output_6.md" > "$final_file"

        # Free empty line, then output_5.md
        echo "" >> "$final_file"
        echo "" >> "$final_file"
        cat "$folder/output_5.md" >> "$final_file"

        # Free empty line, then output_4.md
        echo "" >> "$final_file"
        echo "" >> "$final_file"
        cat "$folder/output_4.md" >> "$final_file"

        # Free empty line, then output_2.md
        echo "" >> "$final_file"
        echo "" >> "$final_file"
        cat "$folder/output_2.md" >> "$final_file"

        # Free empty line, then output_3.md (no empty line after the last file)
        echo "" >> "$final_file"
        echo "" >> "$final_file"
        cat "$folder/output_3.md" >> "$final_file"

        echo "Combined files for $folder_name into ${folder_name}.md"
    else
        echo "Skipping $folder_name - missing required files"
    fi
done

echo "File combination process complete."
# ------------------------------------------------------------------------------------------------
