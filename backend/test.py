import sqlite3

conn = sqlite3.connect("callcenter.db")
cursor = conn.cursor()

cursor.execute("SELECT * FROM admin_users")
rows = cursor.fetchall()

# Print column names
column_names = [description[0] for description in cursor.description]
print("Columns:", column_names)

print("\nData:")
for row in rows:
    print(row)

conn.close()