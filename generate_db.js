const fs = require('fs');
const path = require('path');

// Пути к файлам вашего проекта
const dbPath = path.join(__dirname, 'database.js');
const docsDir = path.join(__dirname, 'documents');

console.log('🚀 Старт автоматической сборки медиа-архива (Русские названия)...');

if (!fs.existsSync(dbPath)) {
    console.error('❌ Ошибка: Файл database.js не найден!');
    process.exit(1);
}

let fileContent = fs.readFileSync(dbPath, 'utf8');
let jsonText = fileContent.replace(/^\s*window\.db\s*=\s*/, '').replace(/;\s*$/, '');
jsonText = jsonText.replace(/\/\/.*$/gm, '');

let db;
try {
    db = JSON.parse(jsonText);
} catch (e) {
    console.error('❌ Ошибка чтения JSON. Проверьте синтаксис (запятые/скобки).', e.message);
    process.exit(1);
}

if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir);
}

const folders = fs.readdirSync(docsDir);
let updatedCount = 0;

for (const personId in db) {
    const person = db[personId];
    const folderName = person.archive || personId;
    const personFolder = path.join(docsDir, folderName);

    if (fs.existsSync(personFolder) && fs.lstatSync(personFolder).isDirectory()) {
        const files = fs.readdirSync(personFolder).filter(file => {
            return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(path.extname(file).toLowerCase());
        });

        if (files.length > 0) {
            person.documents = files.map(file => {
                // Извлекаем имя файла без расширения (.jpg/.png)
                let cleanTitle = path.basename(file, path.extname(file))
                                    .replace(/_/g, ' ') // Меняем подчеркивания на пробелы для красоты
                                    .trim();
                
                return {
                    url: file,
                    title: {
                        ru: cleanTitle, // Скрипт запишет сюда реальное имя файла (включая русский язык)
                        en: "Archive document"
                    }
                };
            });
            updatedCount++;
        } else {
            delete person.documents;
        }
    }
}

const outputContent = `window.db = ${JSON.stringify(db, null, 2)};`;
fs.writeFileSync(dbPath, outputContent, 'utf8');

console.log(`\n✨ Сборка успешно завершена!`);
console.log(`Синхронизировано папок: ${updatedCount}.`);
console.log(`Если вы переименовали файлы на русском, они уже обновились в проекте.`);