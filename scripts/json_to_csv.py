import json
import csv
import os

# Define paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
input_file = os.path.join(base_dir, 'src', 'data', 'eredivisie_con_giornate.json')
output_file = os.path.join(base_dir, 'eredivisie_matches.csv')

def json_to_csv():
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Define CSV headers
        headers = ['home_team', 'away_team', 'home_corners', 'away_corners', 'giornata']
        
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            
            count = 0
            for match in data:
                # Extract data flattening the structure
                row = {
                    'home_team': match['squadre']['home'],
                    'away_team': match['squadre']['away'],
                    'home_corners': match['calci_d_angolo']['home'],
                    'away_corners': match['calci_d_angolo']['away'],
                    'giornata': match['giornata']
                }
                writer.writerow(row)
                count += 1
                
        print(f"Successfully converted {count} matches to CSV.")
        print(f"Output file: {output_file}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    json_to_csv()
