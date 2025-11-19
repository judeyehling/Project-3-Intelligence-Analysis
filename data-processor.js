/*
 * data-processor.js
 * will be responsible for fetching and processing the raw dataset.txt file.
 */

/*hardcoded aliases*/
export const ALIAS_MAP = {
    "Abu Hafs": "Abdillah Zinedine",
    "Mehdi Rafiki": "Abdillah Zinedine",
    "Fr. Augustin Dominique": "Abdal al Hawsawi",
    "Omar Blakely": "Rifai Qasim",
    "Ronald": "Satam Derwish",
    "Ralph Bean": "Raeed Beandali",
    "Reginald Cooper": "Mahmud al-Dahab",
    "A. Somad": "Abu Somad",
    "Y. Bafaba": "Yazid Bafaba",
    "Hafs or Halfs": "Abdillah Zinedine", 
    "al Quso": "Jamal al Quso",
    "Dr. Badawi": "Fahd al Badawi",
    "Yasir Salman": "Saeed Hasham",
    "Hamid Qatada": "Saeed Hasham",
};

export async function getProcessedData() {
    const response = await fetch('dataset.txt');
    const rawText = await response.text();
    
}

function parseRawData(rawText) {
}

//for aliases
function resolveEntities() {
}

//deal with incomplete locations
function cleanPlaceData() {
}

// ^ one for time?

//for people and org nodes
function getAllEntities() {

}

function generateNetworkData() {
}

function generateLocationData() {
}

function generateTimelineData() {
}