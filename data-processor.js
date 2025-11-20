/******************************************************************
* data-processor.js
* Responsible for fetching and processing raw dataset.txt file.
******************************************************************/

/**
* Hardcoded map to resolve aliases.
**/
export const ALIAS_MAP = {
    "Abu Hafs": "Abdillah Zinedine",
    "Mehdi Rafiki": "Abdillah Zinedine",
    "Fr. Augustin Dominique": "Abdal al Hawsawi",
    "Omar Blakely": "Rifai Qasim",
    "Ronald": "Satam Derwish",
    "R. Derwish": "Satam Derwish",
    "Ronald Derwish": "Satam Derwish",
    "Ralph Bean": "Raeed Beandali",
    "Reginald Cooper": "Mahmud al-Dahab",
    "Boris": "Boris Bugarov",
    "Pyotr": "Pyotr Sofrygin",
    "Sofrygin": "Pyotr Sofrygin",
    "A. Somad": "Abu Somad",
    "Y. Bafaba": "Yazid Bafaba",
    "Hafs or Halfs": "Abdillah Zinedine", 
    "al Quso": "Jamal al Quso",
    "Dr. Badawi": "Fahd al Badawi",
    "Yasir Salman": "Saeed Hasham",
    "Hamid Qatada": "Saeed Hasham",
};

/**
* Main function to fetch, parse, and process data.
* @returns Promise that resolves to object
* containing reports and data for visuals.
**/
export async function getProcessedData() {
    // fetch text
    const response = await fetch('dataset.txt');
    const rawText = await response.text();
    
    // run parsing and cleaning 
    let reports = parseRawData(rawText);
    reports = resolveEntities(reports);
    reports = cleanPlaceData(reports);

    // generate structures for visualizations
    const allEntities = getAllEntities(reports);
    const network = generateNetworkData(reports, allEntities);
    const locationCounts = generateLocationData(reports);
    const timelineData = generateTimelineData(reports);

    return {
        allReports: reports,
        allEntities: allEntities,
        vizData: {
            network,
            locationCounts,
            timelineData,
        }
    };
}

/**
* Parses raw dataset.txt into object array.
* @param rawText String content from the file.
* @returns Array of report objects.
**/
function parseRawData(rawText) {
    const reports = [];

    // split reports by 'REPORT' keyword
    const reportBlocks = rawText.split('REPORT\n').filter(Boolean);

    for (const block of reportBlocks) {
        const report = {};
        let currentField = null;
        let content = [];

        const lines = block.split('\n');
        for (const line of lines) {
            // catch all '[HEADER]:' in REPORT block
            const match = line.match(/^([A-Z]+):\s*(.*)/);
            if (match) {
                // if on a new field, save old one
                if (currentField) {
                    report[currentField.toLowerCase()] = content.join(' ').trim();
                }
                
                // start new field
                currentField = match[1];
                content = [match[2]];
            } else if (currentField) {
                // adding to the current field
                content.push(line);
            }
        }
        // save last field
        if (currentField) {
            report[currentField.toLowerCase()] = content.join(' ').trim();
        }

        // clean fields
        if (report.id) {
            let dateString = report.reportdate;

if (dateString) {
    // replace date blanks with '1' because '0' sets it to the previous date
    dateString = dateString.replace(/(\d+)\/\s+\/(\d{4})/, '$1/1/$2');
    dateString = dateString.replace(/\s+\/\s+\/(\d{4})/, '1/1/$1');
}

// parse cleaned string
const d = new Date(dateString);

// check if date is valid. assign if original wasn't empty AND date valid.
            report.date = dateString && !isNaN(d.getTime()) ? d : null;
            report.persons = report.persons ? report.persons.split(';').map(s => s.trim()).filter(Boolean) : [];
            report.places = report.places ? report.places.split(';').map(s => s.trim()).filter(Boolean) : [];
            report.organizations = report.organizations ? report.organizations.split(';').map(s => s.trim()).filter(Boolean) : [];
            reports.push(report);
        }
    }
    return reports;
}

/**
* Resolves aliases in PERSONS field.
* @param reports Array of parsed reports.
* @returns Reports array with 'persons_resolved' field.
**/
function resolveEntities(reports) {
    return reports.map(report => {
        report.persons_resolved = report.persons.map(person => ALIAS_MAP[person] || person);
        return report;
    });
}

/**
* Creates 'places_clean' field for filtering.
* uses heuristic to extract the city/main location.
* @param reports Array of parsed reports.
* @returns Reports array with 'places_clean' field.
**/
function cleanPlaceData(reports) {
    return reports.map(report => {
        report.places_clean = report.places.map(place => {
            const parts = place.split('/').map(s => s.trim()).filter(Boolean);
            if (parts.length === 0) return 'Unknown';
            // break down to city
            if (parts.length > 2) return parts[parts.length - 3];
            if (parts.length === 2) return parts[0];
            return parts[0];
        }).filter(Boolean);
        return report;
    });
}

/**
* Makes master list of unique people and orgs.
* @param reports Array of processed reports.
* @returns Object with `persons` and `organizations` sets.
**/
function getAllEntities(reports) {
    const persons = new Set();
    const organizations = new Set();
    reports.forEach(r => {
        r.persons_resolved.forEach(p => persons.add(p));
        r.organizations.forEach(o => organizations.add(o));
    });
    return { persons, organizations };
}

/**
* Generates node and link data for force-directed graph.
* @param reports Array of processed reports.
* @param allEntities Sets of all persons and orgs.
* @returns Object with `nodes` and `links` arrays.
**/
function generateNetworkData(reports, allEntities) {
    // all entities to single node array
    const nodes = [
        ...[...allEntities.persons].map(p => ({ id: p, type: 'person' })),
        ...[...allEntities.organizations].map(o => ({ id: o, type: 'organization' }))
    ];

    const links = [];
    const linkSet = new Set(); // prevent dups

    for (const report of reports) {
        // combine nodes into report
        const entitiesInReport = [
            ...report.persons_resolved,
            ...report.organizations
        ];

        // links between EVERYTHING to prevent free floating 
        for (let i = 0; i < entitiesInReport.length; i++) {
            for (let j = i + 1; j < entitiesInReport.length; j++) {
                const source = entitiesInReport[i];
                const target = entitiesInReport[j];
                
                // sorted key for dups
                const key = [source, target].sort().join('|');
                if (!linkSet.has(key) && source !== target) {
                    links.push({ source, target, reportId: report.id });
                    linkSet.add(key);
                }
            }
        }
    }
    
    return { nodes, links };
}

/**
* Generates sorted data for location bar chart.
* @param reports Array of processed reports.
* @returns Sorted array of {location, count} objects.
**/
function generateLocationData(reports) {
    const counts = new Map();
    for (const report of reports) {
        for (const location of report.places_clean) {
            if (location !== 'Unknown') {
                counts.set(location, (counts.get(location) || 0) + 1);
            }
        }
    }
    
    //convert to array and sort for scale map
    return Array.from(counts, ([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count);
}

/**
* Generates/populates bins timeline chart.
* @param reports Array of processed reports.
* @returns Array of {date, count} objects binned by month.
**/
function generateTimelineData(reports) {
    const counts = new Map();
    for (const report of reports) {
        if (report.date) {
            const monthKey = report.date.toISOString().slice(0, 7); // "YYYY-MM" for bins
            counts.set(monthKey, (counts.get(monthKey) || 0) + 1);
        }
    }

    // convert back to Dates for timeline use 
    return Array.from(counts, ([dateStr, count]) => ({
        date: new Date(dateStr + '-01'), 
        count
    })).sort((a, b) => a.date - b.date);
}


