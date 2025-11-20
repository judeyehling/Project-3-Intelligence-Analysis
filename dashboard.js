/**
* dashboard.js
* Responsible for D3 visualization and interactivity.
* imports processed data, handles filtering and updating logic.
**/
import { getProcessedData, ALIAS_MAP } from './data-processor.js';

// raw data and current filter
let allReports = [];
let allEntities = {};
let vizData = {};
let currentFilters = {
    entity: null,
    location: null,
    timeRange: null,
};
let forceSimulation; // to hold d3 simulation

// dom elements
const networkSvg = d3.select("#network-svg");
const locationSvg = d3.select("#location-svg");
const timelineSvg = d3.select("#timeline-svg");
const reportListEl = document.getElementById("report-list");
const reportCountEl = document.getElementById("report-count");
const networkLoadingEl = document.getElementById("network-loading");
const resetButton = document.getElementById("reset-button");

// chart margins
const margins = { top: 10, right: 20, bottom: 40, left: 100 };
const timelineMargins = { top: 10, right: 20, bottom: 20, left: 40 };

/**
* Main initialization function.
* Runs when page is loaded.
**/
async function initializeDashboard() {
    try {
        // fetch processed data
        const data = await getProcessedData();
        allReports = data.allReports;
        allEntities = data.allEntities;
        vizData = data.vizData;

        // initial draw of components
        drawNetworkGraph(vizData.network);
        drawLocationChart(vizData.locationCounts.slice(0,20)); // top 20 for readability
        drawTimeline(vizData.timelineData);
        updateDashboard(); // show all reports

        networkLoadingEl.style.display = 'none';

        // event listener for reset button
        resetButton.addEventListener('click', ()=>{window.location.reload()}); // force reload since resetFilters wouldn't work

    } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        networkLoadingEl.innerText = "Failed to load data. Please check dataset.txt and refresh.";
    }
}


/**
* Updates dashboard based on currentFilters.
**/
function updateDashboard() {
    let filteredReports = allReports;

    // entity filter
    if (currentFilters.entity) {
        filteredReports = filteredReports.filter(r => 
            r.persons_resolved.includes(currentFilters.entity) || 
            r.organizations.includes(currentFilters.entity)
        );
        
        // highlight network
        highlightNetwork(currentFilters.entity);
    }
    else {
        // EXPLICITLY reset opacity if no entity selected
        networkSvg.selectAll('.node-group').style('opacity', 1);
        networkSvg.selectAll('.link').style('opacity', 0.6);
    }

    // location filter
    if (currentFilters.location) {
        filteredReports = filteredReports.filter(r => 
            r.places_clean.includes(currentFilters.location)
        );
        
        // highlight location chart
        locationSvg.selectAll('.location-bar')
            .style('opacity', d => d.location === currentFilters.location ? 1 : 0.3);
    }

    // time filter
    if (currentFilters.timeRange) {
        filteredReports = filteredReports.filter(r =>
            r.date >= currentFilters.timeRange[0] && r.date <= currentFilters.timeRange[1]
        );
    }

    // update report list
    drawReportList(filteredReports);
}

/**
 * Draws the force-directed network graph.
 * @param networkData Object with {nodes, links} arrays
 */
function drawNetworkGraph({ nodes, links }) {
    const container = document.getElementById('network-graph');
    const width = container.clientWidth;
    const height = container.clientHeight;

    networkSvg.attr('viewBox', [0, 0, width, height]);
    // force configuration
    forceSimulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(50))
        .force("charge", d3.forceManyBody().strength(-70))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(.6))

        // pls stay in the box
        .force("x", d3.forceX(width / 2).strength(0.1))
        .force("y", d3.forceY(height / 2).strength(0.1));

    // main group to hold EVERYTHING for zoom
    const g = networkSvg.append("g")
        .attr("class", "network-container");

    // draw links
    const link = g.append("g") 
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "link");
    
    // draw nodes
    const node = g.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", "node-group")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));
    // draw node circle
    node.append("circle")
        .attr("r", d => d.type === 'person' ? 8 : 6)
        .attr("class", d => `node ${d.type}`)
        .on("click", onNodeClick);
    // draw label
    node.append("text")
        .text(d => d.id)
        .attr("x", 12)
        .attr("y", 4)
        .attr("class", "node-label");
        
    node.append("title")
        .text(d => `${d.type}: ${d.id}`);

    // update positions for drag physics
    forceSimulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    
    // allow zoom behavior
    function handleZoom(event) {
        g.attr("transform", event.transform);
    }

    // create zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([.75, 2]) // min & max
        .on("zoom", handleZoom);
    
    // apply zoom behavior to SVG
    networkSvg.call(zoom);

    // store zoom behavior on element for reset
    networkSvg.property("__zoom", zoom);
    });

    // drag handlers
    function dragstarted(event, d) {
        if (!event.active) forceSimulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    // fix node to mouse
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    // release into physics
    function dragended(event, d) {
        if (!event.active) forceSimulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}

/**
* Handles clicking on network node.
* @param event Click event.
* @param d Node data.
**/
function onNodeClick(event, d) {
    currentFilters.entity = (currentFilters.entity === d.id) ? null : d.id;
    
    // reset other filters
    currentFilters.location = null;
    currentFilters.timeRange = null;
    d3.select('#timeline-brush').call(d3.brushX().clear);
    locationSvg.selectAll('.location-bar').style('opacity', 1);

    if (currentFilters.entity) {
        highlightNetwork(d.id);
    } else {
        // reset when deselected
        networkSvg.selectAll('.node-group').style('opacity', d => neighbors.has(d.id) ? 1 : 0.1);
        networkSvg.selectAll('.link').style('opacity', 0.6);
    }
    
    updateDashboard();
}

/**
* Highlights selected node and neighbors.
* @param entityId ID of node to highlight.
**/
function highlightNetwork(entityId) {
    const { links } = vizData.network;
    const neighbors = new Set([entityId]);
    // find neighbors
    links.forEach(l => {
        if (l.source.id === entityId) neighbors.add(l.target.id);
        if (l.target.id === entityId) neighbors.add(l.source.id);
    });
    // apply filter
    networkSvg.selectAll('.node-group')
        .style('opacity', d => neighbors.has(d.id) ? 1 : 0.1);
        
    networkSvg.selectAll('.link')
        .style('opacity', d => (d.source.id === entityId || d.target.id === entityId) ? 1 : 0.1);
}

/**
* Draws horizontal bar chart for locations.
* @param locationData Array of {location, count}.
**/
function drawLocationChart(locationData) {
    const container = document.getElementById('location-chart');
    const width = container.clientWidth;
    const height = locationData.length * 20; // 20px per bar
    
    locationSvg.attr('viewBox', [0, 0, width, height + margins.top + margins.bottom]);

    // y category scale
    const y = d3.scaleBand()
        .domain(locationData.map(d => d.location))
        .range([margins.top, height])
        .padding(0.1);

    // x numerical scale 
    const x = d3.scaleLinear()
        .domain([0, d3.max(locationData, d => d.count)])
        .range([margins.left, width - margins.right]);

    const g = locationSvg.append("g");

    // draw bars
    g.selectAll("rect")
        .data(locationData)
        .join("rect")
        .attr("class", "location-bar")
        .attr("x", x(0))
        .attr("y", d => y(d.location))
        .attr("width", d => x(d.count) - x(0))
        .attr("height", y.bandwidth())
        .on("click", onLocationClick);

    // draw count labels
    g.selectAll("text")
        .data(locationData)
        .join("text")
        .attr("class", "location-label")
        .attr("x", d => x(d.count) + 5)
        .attr("y", d => y(d.location) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .text(d => d.count);

    // draw axis with names 
    locationSvg.append("g")
        .attr("transform", `translate(${margins.left},0)`)
        .call(d3.axisLeft(y).tickSize(0).tickPadding(5))
        .attr("class", "location-axis")
        .selectAll("text")
        .style("fill", "#d1d5db");
}

/**
* Handles clicking location bar.
* @param {Event} event - The click event.
* @param {object} d - The location data.
**/
function onLocationClick(event, d) {
    currentFilters.location = (currentFilters.location === d.location) ? null : d.location;

    // reset filters
    currentFilters.entity = null;
    currentFilters.timeRange = null;
    d3.select('#timeline-brush').call(d3.brushX().clear);
    networkSvg.selectAll('.node-group').style('opacity', 1);
    networkSvg.selectAll('.link').style('opacity', 0.6);

    // apply filter
    if (currentFilters.location) {
        locationSvg.selectAll('.location-bar')
            .style('opacity', data => data.location === d.location ? 1 : 0.3);
    } else {
        locationSvg.selectAll('.location-bar').style('opacity', 1);
    }

    updateDashboard();
}

/**
* Draws timeline chart with brush.
* @param timelineData Array of {date, count}.
**/
function drawTimeline(timelineData) {
    const container = document.getElementById('timeline-chart');
    const width = container.clientWidth;
    const height = 120; // Fixed height for timeline
    
    timelineSvg.attr('viewBox', [0, 0, width, height]);

    // time scale
    const x = d3.scaleTime()
        .domain(d3.extent(timelineData, d => d.date))
        .range([timelineMargins.left, width - timelineMargins.right]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(timelineData, d => d.count)])
        .range([height - timelineMargins.bottom, timelineMargins.top]);

    // draw time axis 
    const xAxis = g => g
        .attr("transform", `translate(0,${height - timelineMargins.bottom})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickSizeOuter(0))
        .selectAll("text")
        .style("fill", "#d1d5db");

    timelineSvg.append("g").call(xAxis);

    // draw bars
    timelineSvg.append("g")
        .selectAll("rect")
        .data(timelineData)
        .join("rect")
        .attr("class", "timeline-bar")
        .attr("x", d => x(d.date))
        .attr("y", d => y(d.count))
        .attr("width", 5) // bin width 
        .attr("height", d => y(0) - y(d.count));

    // define brush
    const brush = d3.brushX()
        .extent([[timelineMargins.left, timelineMargins.top], [width - timelineMargins.right, height - timelineMargins.bottom]])
        .on("end", onTimeBrush);

    // add brush layer
    timelineSvg.append("g")
        .attr("class", "timeline-brush")
        .attr("id", "timeline-brush")
        .call(brush);
}

/**
* Handles end of brush event on timeline.
* @param event Brush event.
**/
function onTimeBrush(event) {
    if (event.selection) {
        // convert coords to Dates
        const [x0, x1] = event.selection;
        currentFilters.timeRange = [
            d3.scaleTime().domain(d3.extent(vizData.timelineData, d => d.date)).range([timelineMargins.left, document.getElementById('timeline-chart').clientWidth - timelineMargins.right]).invert(x0),
            d3.scaleTime().domain(d3.extent(vizData.timelineData, d => d.date)).range([timelineMargins.left, document.getElementById('timeline-chart').clientWidth - timelineMargins.right]).invert(x1)
        ];
    } else {
        currentFilters.timeRange = null;
    }

    // reset filters
    currentFilters.entity = null;
    currentFilters.location = null;
    networkSvg.selectAll('.node-group').style('opacity', 1);
    networkSvg.selectAll('.link').style('opacity', 0.6);
    locationSvg.selectAll('.location-bar').style('opacity', 1);

    updateDashboard();
}

/**
* Draws list of reports.
* @param reports Array of reports to display.
**/
function drawReportList(reports) {
    reportCountEl.innerText = reports.length;
    reportListEl.innerHTML = ""; // clear existing list

    // regex to find all entities
    const allEntitiesList = [
        ...allEntities.persons, 
        ...allEntities.organizations
    ];
    // sort by descending length to match full names before partial
    allEntitiesList.sort((a, b) => b.length - a.length);
    const entityRegex = new RegExp(`\\b(${allEntitiesList.join('|')})\\b`, 'g');
    
    reports.forEach(report => {
        // highlight entities in description
        const highlightedDesc = report.reportdescription.replace(
            entityRegex,
            (match) => {
                // resolve aliases, use match
                const resolved = ALIAS_MAP[match] || match;
                return `<span class="clickable" data-entity-id="${resolved}">${match}</span>`;
            }
        );

        // html card for each report
        const card = document.createElement('div');
        card.className = 'report-card';
        card.innerHTML = `
            <div class="report-header">
                <h3 class="report-id">${report.id}</h3>
                <span class="report-date">${report.date ? report.date.toLocaleDateString() : 'No Date'}</span>
            </div>
            <p class="report-description">${highlightedDesc}</p>
        `;
        reportListEl.appendChild(card);
    });
    
    // event listeners for highlights
    reportListEl.querySelectorAll('.clickable').forEach(el => {
        el.addEventListener('click', (e) => {
            const entityId = e.target.dataset.entityId;
            currentFilters.entity = entityId;
            // reset filters
            currentFilters.location = null;
            currentFilters.timeRange = null;
            d3.select('#timeline-brush').call(d3.brushX().clear);
            locationSvg.selectAll('.location-bar').style('opacity', 1);
            
            highlightNetwork(entityId);
            updateDashboard();
        });
    });
}

// start application
document.addEventListener('DOMContentLoaded', initializeDashboard);
