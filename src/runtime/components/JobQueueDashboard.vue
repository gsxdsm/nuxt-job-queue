<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const { data: jobData, refresh, pending: loading } = await useFetch('/api/_jobqueue/jobs')
const selectedJob = ref(null)
const statusFilter = ref('all')
const searchTerm = ref('')
const refreshIntervalSeconds = ref(10) // Default: 10 seconds

// Sorting state
const sortColumn = ref('id')  // Default sort column
const sortDirection = ref('desc')  // Default sort direction (descending)
const sortableColumns = ['id', 'delay', 'created_at', 'updated_at']

// Define available columns
const availableColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'queue', label: 'Queue' },
  { key: 'status', label: 'Status' },
  { key: 'delay', label: 'Next Run' }, // Renamed from "Delay" to "Next Run"
  { key: 'cron', label: 'Cron' },
  { key: 'retry', label: 'Retry' },
  { key: 'created_at', label: 'Created' },
  { key: 'updated_at', label: 'Updated' },
  { key: 'actions', label: 'Actions' }
]

// Column selection state
const showColumnSelector = ref(false)
const defaultColumnKeys = ['id', 'name', 'queue', 'status', 'delay', 'cron', 'retry', 'created_at', 'updated_at', 'actions']
const selectedColumnKeys = ref([...defaultColumnKeys]) // Start with all columns visible
const columnWidths = ref({}) // Store widths for each column
const jobTable = ref(null) // Reference to the table element
const resizing = ref(false) // Flag for when resize is in progress
const currentColumn = ref(null) // Column being resized
const startX = ref(0) // Starting X position for resize
const startWidth = ref(0) // Starting width for resize

// For resize handling - initialize with a safe default value
const documentWidth = ref(0) // Default value that will be updated on mount

// New state for params and result modals
const showParamsModal = ref(false)
const showResultModal = ref(false)
const selectedParams = ref(null)
const selectedResult = ref(null)

// Computed property for visible columns based on selection
const visibleColumns = computed(() => {
  return availableColumns.filter(column => selectedColumnKeys.value.includes(column.key))
})

// Deduplicated jobs computed property
const jobs = computed(() => {
  const rawJobs = jobData.value?.jobs || []

  // Use a Map to deduplicate jobs by ID
  const uniqueJobs = new Map()

  // Only keep the latest instance of each job ID
  rawJobs.forEach(job => {
    uniqueJobs.set(job.id, job)
  })

  // Convert Map values back to array
  return Array.from(uniqueJobs.values())
})

const pendingJobs = computed(() => jobs.value.filter(j => j.status === 'queued'))
const completedJobs = computed(() => jobs.value.filter(j => j.status === 'complete'))
const failedJobs = computed(() => jobs.value.filter(j => j.status === 'failed'))

const refreshIntervalDisplay = computed(() => {
  if (refreshIntervalSeconds.value === 0) {
    return 'Disabled'
  } else
    if (refreshIntervalSeconds.value < 60) {
      return `${refreshIntervalSeconds.value} seconds`
    } else {
      const minutes = Math.floor(refreshIntervalSeconds.value / 60)
      const seconds = refreshIntervalSeconds.value % 60
      return seconds ? `${minutes}m ${seconds}s` : `${minutes} minutes`
    }
})

const filteredJobs = computed(() => {
  let filtered = jobs.value

  // Apply status filter
  if (statusFilter.value !== 'all') {
    filtered = filtered.filter(job => job.status === statusFilter.value)
  }

  // Apply search term
  if (searchTerm.value) {
    const term = searchTerm.value.toLowerCase()
    filtered = filtered.filter(job =>
      job.name.toLowerCase().includes(term) ||
      job.queue.toLowerCase().includes(term) ||
      String(job.id).includes(term)
    )
  }

  return filtered
})

// Sorted jobs based on current sort column and direction
const sortedJobs = computed(() => {
  const filtered = filteredJobs.value.slice() // Create a copy to avoid mutating original

  return filtered.sort((a, b) => {
    let comparison = 0

    switch (sortColumn.value) {
      case 'id':
        comparison = a.id - b.id
        break
      case 'delay': {
        // Handle comparing dates
        const delayA = a.delay ? new Date(a.delay).getTime() : 0
        const delayB = b.delay ? new Date(b.delay).getTime() : 0
        comparison = delayA - delayB
        break
      }
      case 'created_at': {
        // Handle comparing dates
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0
        comparison = createdA - createdB
        break
      }
      case 'updated_at': {
        // Handle comparing dates
        const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0
        comparison = updatedA - updatedB
        break
      }
      default:
        comparison = 0
    }

    return sortDirection.value === 'asc' ? comparison : -comparison
  })
})

// Function to handle sorting when a column header is clicked
function sortBy(columnKey) {
  if (sortColumn.value === columnKey) {
    // Toggle direction if clicking the same column
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    // Set new column and default to ascending
    sortColumn.value = columnKey
    sortDirection.value = 'asc'
  }
}

function formatDate(timestamp) {
  if (!timestamp) return '-'

  // Create a formatter that uses 2-digit year
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return formatter.format(new Date(timestamp))
}

function formatJson(data) {
  if (!data) return ''
  try {
    if (typeof data === 'string') {
      return JSON.stringify(JSON.parse(data), null, 2)
    }
    return JSON.stringify(data, null, 2)
  } catch (e) {
    return data
  }
}

function formatDelayAsRelativeTime(timestamp) {
  if (!timestamp) return '-'

  const now = Date.now()
  const delayTime = new Date(timestamp).getTime()

  // If timestamp is in the past, just show the date
  if (delayTime <= now) {
    return formatDate(timestamp)
  }

  const diffMs = delayTime - now
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Format relative time
  if (diffSeconds < 60) {
    return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} from now`
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} from now`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} from now`
  } else if (diffDays === 1) {
    return 'tomorrow'
  } else if (diffDays < 7) {
    return `${diffDays} days from now`
  } else {
    // For dates more than a week away, show the actual date
    return formatDate(timestamp)
  }
}

// Reset columns to default selection
function resetColumnsToDefault() {
  selectedColumnKeys.value = [...defaultColumnKeys]
}

// Column resizing functions
function startResize(event, columnKey) {
  event.preventDefault()

  // Get current width of column being resized
  const table = jobTable.value
  if (!table) return

  let clientX
  if (event.type === 'touchstart') {
    clientX = event.touches[0].clientX
  } else {
    clientX = event.clientX
  }

  resizing.value = true
  currentColumn.value = columnKey
  startX.value = clientX

  // Get current width from styles or compute it
  const currentWidth = columnWidths.value[columnKey] ||
    getComputedStyle(table.querySelector(`colgroup col:nth-child(${selectedColumnKeys.value.indexOf(columnKey) + 1})`)).width

  startWidth.value = parseInt(currentWidth, 10)

  // Add event listeners
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('touchmove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.addEventListener('touchend', stopResize)

  // Add a resize class to the body to disable text selection during resize
  document.body.classList.add('resizing')
}

function handleResize(event) {
  if (!resizing.value || !currentColumn.value) return

  // Get current pointer position
  let clientX
  if (event.type === 'touchmove') {
    clientX = event.touches[0].clientX
  } else {
    clientX = event.clientX
  }

  // Calculate width difference
  const diff = clientX - startX.value

  // Ensure minimum width of 50px
  const newWidth = Math.max(50, startWidth.value + diff)

  // Update column width
  columnWidths.value = {
    ...columnWidths.value,
    [currentColumn.value]: `${newWidth}px`
  }
}

function stopResize() {
  resizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('touchmove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchend', stopResize)
  document.body.classList.remove('resizing')
}

// Functions for handling params and result modals
function viewParams(job) {
  selectedParams.value = job
  showParamsModal.value = true
}

function viewResult(job) {
  selectedResult.value = job
  showResultModal.value = true
}

async function retryJob(id) {
  try {
    await $fetch(`/api/_jobqueue/jobs/${id}/retry`, { method: 'POST' })
    if (selectedJob.value && selectedJob.value.id === id) {
      selectedJob.value = null
    }
    await refresh()
  } catch (error) {
    console.error('Failed to retry job:', error)
  }
}

async function removeJob(id) {
  if (!confirm('Are you sure you want to remove this job?')) return

  try {
    await $fetch(`/api/_jobqueue/jobs/${id}`, { method: 'DELETE' })
    if (selectedJob.value && selectedJob.value.id === id) {
      selectedJob.value = null
    }
    await refresh()
  } catch (error) {
    console.error('Failed to remove job:', error)
  }
}

function viewJobDetails(job) {
  selectedJob.value = job
}

// Save column preferences to localStorage
function saveColumnPreferences() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('jobQueueColumnSelection', JSON.stringify(selectedColumnKeys.value))
    localStorage.setItem('jobQueueColumnWidths', JSON.stringify(columnWidths.value))
  }
}

// Load column preferences from localStorage
function loadColumnPreferences() {
  if (typeof localStorage !== 'undefined') {
    try {
      const savedColumnSelection = localStorage.getItem('jobQueueColumnSelection')
      if (savedColumnSelection) {
        selectedColumnKeys.value = JSON.parse(savedColumnSelection)
      }

      const savedColumnWidths = localStorage.getItem('jobQueueColumnWidths')
      if (savedColumnWidths) {
        columnWidths.value = JSON.parse(savedColumnWidths)
      }
    } catch (e) {
      console.error('Error loading column preferences:', e)
    }
  }
}

// Save sorting preferences to localStorage
function saveSortPreferences() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('jobQueueSortColumn', sortColumn.value)
    localStorage.setItem('jobQueueSortDirection', sortDirection.value)
  }
}

// Load sorting preferences from localStorage
function loadSortPreferences() {
  if (typeof localStorage !== 'undefined') {
    try {
      const savedSortColumn = localStorage.getItem('jobQueueSortColumn')
      if (savedSortColumn && sortableColumns.includes(savedSortColumn)) {
        sortColumn.value = savedSortColumn
      }

      const savedSortDirection = localStorage.getItem('jobQueueSortDirection')
      if (savedSortDirection && ['asc', 'desc'].includes(savedSortDirection)) {
        sortDirection.value = savedSortDirection
      }
    } catch (e) {
      console.error('Error loading sort preferences:', e)
    }
  }
}

// Refresh interval management
let refreshInterval

function setupRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  if (refreshIntervalSeconds.value === 0) return
  refreshInterval = setInterval(() => refresh(), refreshIntervalSeconds.value * 1000)
}

watch(refreshIntervalSeconds, () => {
  setupRefreshInterval()
})

// Save column preferences when they change
watch([selectedColumnKeys, columnWidths], () => {
  saveColumnPreferences()
}, { deep: true })

// Save sort preferences when they change
watch([sortColumn, sortDirection], () => {
  saveSortPreferences()
}, { deep: true })

onMounted(() => {
  setupRefreshInterval()
  loadColumnPreferences()
  loadSortPreferences() // Load sort preferences

  // Set the documentWidth on mount when window is available
  documentWidth.value = window.innerWidth

  // Setup event listener for window resize
  window.addEventListener('resize', () => {
    documentWidth.value = window.innerWidth
  })
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)

  // Clean up event listeners
  window.removeEventListener('resize', () => {
    documentWidth.value = window.innerWidth
  })
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('touchmove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchend', stopResize)
})
</script>

<template>
  <div class="job-queue-dashboard">
    <h1 class="dashboard-title">
      <svg class="header-icon" width="32" height="32" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="6" width="18" height="3" rx="1" fill="#4CAF50" />
        <rect x="3" y="11" width="18" height="3" rx="1" fill="#2196F3" />
        <rect x="3" y="16" width="18" height="3" rx="1" fill="#9C27B0" />
        <circle cx="18" cy="7.5" r="1.5" fill="white" />
        <circle cx="15" cy="12.5" r="1.5" fill="white" />
        <circle cx="19" cy="17.5" r="1.5" fill="white" />
      </svg>
      Nuxt Job Queue Dashboard
    </h1>

    <div class="dashboard-controls">
      <button @click="refresh" class="refresh-btn">
        <span class="icon">↻</span> Refresh
      </button>

      <div class="refresh-interval-control">
        <div class="slider-container">
          <span class="slider-label">Auto Refresh: {{ refreshIntervalDisplay }}</span>
          <input id="refresh-interval" type="range" min="0" max="300" step="5" v-model.number="refreshIntervalSeconds"
            class="refresh-slider" />
        </div>
      </div>

      <div class="filter-controls">
        <button @click="showColumnSelector = true" class="column-select-btn">
          <span class="icon">☰</span> Columns
        </button>
        <select v-model="statusFilter" class="filter-select">
          <option value="all">All Jobs</option>
          <option value="queued">Pending</option>
          <option value="complete">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input v-model="searchTerm" placeholder="Search jobs..." class="search-input" />
      </div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <h3>{{ jobs.length }}</h3>
        <p>Total Jobs</p>
      </div>
      <div class="stat-card">
        <h3>{{ pendingJobs.length }}</h3>
        <p>Pending</p>
      </div>
      <div class="stat-card">
        <h3>{{ completedJobs.length }}</h3>
        <p>Completed</p>
      </div>
      <div class="stat-card">
        <h3>{{ failedJobs.length }}</h3>
        <p>Failed</p>
      </div>
    </div>

    <div v-if="loading" class="loading-indicator">
      Loading jobs...
    </div>

    <div v-else-if="filteredJobs.length === 0" class="no-jobs">
      No jobs match your filters
    </div>

    <div v-else class="job-table-container">
      <table class="job-table" ref="jobTable">
        <colgroup>
          <col v-for="column in visibleColumns" :key="column.key"
            :style="{ width: columnWidths[column.key] || 'auto' }">
        </colgroup>
        <thead>
          <tr>
            <th v-for="column in visibleColumns" :key="column.key" class="resizable-column"
              :class="{ 'sortable': sortableColumns.includes(column.key), 'sorted': sortColumn === column.key }">
              <div class="column-header-content"
                @click="sortableColumns.includes(column.key) ? sortBy(column.key) : null">
                {{ column.label }}
                <span v-if="sortColumn === column.key" class="sort-indicator">
                  {{ sortDirection === 'asc' ? '▲' : '▼' }}
                </span>
              </div>
              <div class="resize-handle" @mousedown="startResize($event, column.key)"
                @touchstart="startResize($event, column.key)"></div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in sortedJobs" :key="job.id" :class="job.status">
            <td v-for="column in visibleColumns" :key="column.key">
              <template v-if="column.key === 'status'">
                <span class="status-badge" :class="job.status">{{ job.status }}</span>
              </template>
              <template v-else-if="column.key === 'delay'">
                {{ formatDelayAsRelativeTime(job.delay) }}
              </template>
              <template v-else-if="column.key === 'created_at' || column.key === 'updated_at'">
                {{ formatDate(job[column.key]) }}
              </template>
              <template v-else-if="column.key === 'actions'">
                <div class="actions">
                  <button v-if="job.status === 'failed'" @click="retryJob(job.id)" class="action-btn retry">
                    Retry
                  </button>
                  <button @click="removeJob(job.id)" class="action-btn remove">
                    Remove
                  </button>
                  <button @click="viewJobDetails(job)" class="action-btn view">
                    View
                  </button>
                </div>
              </template>
              <template v-else-if="column.key === 'name'">
                <span class="job-name-link" @click="viewJobDetails(job)">{{ job[column.key] || '-' }}</span>
              </template>
              <template v-else>
                {{ job[column.key] || '-' }}
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Column Selector Modal -->
    <div v-if="showColumnSelector" class="modal">
      <div class="modal-content column-selector-modal">
        <div class="modal-header">
          <h3>Select Columns</h3>
          <button @click="showColumnSelector = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="column-list">
            <div v-for="column in availableColumns" :key="column.key" class="column-option">
              <input type="checkbox" :id="'col-' + column.key" :value="column.key" v-model="selectedColumnKeys"
                :disabled="column.key === 'actions'">
              <label :for="'col-' + column.key">{{ column.label }}</label>
            </div>
          </div>
          <div class="column-selector-actions">
            <button @click="resetColumnsToDefault" class="action-btn">Reset to Default</button>
            <button @click="showColumnSelector = false" class="action-btn primary">Apply</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Job Detail Modal -->
    <div v-if="selectedJob" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Job Details</h3>
          <button @click="selectedJob = null" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-row">
            <strong>ID:</strong> {{ selectedJob.id }}
          </div>
          <div class="detail-row">
            <strong>Name:</strong> {{ selectedJob.name }}
          </div>
          <div class="detail-row">
            <strong>Queue:</strong> {{ selectedJob.queue }}
          </div>
          <div class="detail-row">
            <strong>Status:</strong>
            <span class="status-badge" :class="selectedJob.status">{{ selectedJob.status }}</span>
          </div>
          <div class="detail-row">
            <strong>Created:</strong> {{ formatDate(selectedJob.created_at) }}
          </div>
          <div class="detail-row">
            <strong>Updated:</strong> {{ formatDate(selectedJob.updated_at) }}
          </div>
          <div class="detail-row">
            <strong>Priority:</strong> {{ selectedJob.priority }}
          </div>

          <div class="detail-section">
            <h4>Parameters</h4>
            <pre>{{ formatJson(selectedJob.params) }}</pre>
          </div>

          <div v-if="selectedJob.result" class="detail-section">
            <h4>Result</h4>
            <pre>{{ formatJson(selectedJob.result) }}</pre>
          </div>

          <div class="modal-actions">
            <button v-if="selectedJob.status === 'failed'" @click="retryJob(selectedJob.id)" class="action-btn retry">
              Retry Job
            </button>
            <button @click="removeJob(selectedJob.id)" class="action-btn remove">
              Remove Job
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Params Modal -->
    <div v-if="showParamsModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Job Parameters</h3>
          <button @click="showParamsModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-row">
            <strong>Job:</strong> {{ selectedParams.name }} ({{ selectedParams.id }})
          </div>
          <div class="detail-section">
            <pre>{{ formatJson(selectedParams.params) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Result Modal -->
    <div v-if="showResultModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Job Result</h3>
          <button @click="showResultModal = false" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-row">
            <strong>Job:</strong> {{ selectedResult.name }} ({{ selectedResult.id }})
          </div>
          <div class="detail-section">
            <pre>{{ formatJson(selectedResult.result) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .job-queue-dashboard {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  .dashboard-title {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    color: #2c3e50;
  }

  .header-icon {
    flex-shrink: 0;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.1));
  }

  h1 {
    margin-bottom: 20px;
    color: #2c3e50;
  }

  .dashboard-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    gap: 15px;
  }

  .filter-controls {
    display: flex;
    gap: 10px;
  }

  .filter-select,
  .search-input {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .refresh-btn,
  .column-select-btn {
    background: #f8f9fa;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .refresh-btn:hover,
  .column-select-btn:hover {
    background: #e9ecef;
  }

  .icon {
    font-size: 14px;
  }

  .stats {
    display: flex;
    gap: 15px;
    margin-bottom: 30px;
  }

  .stat-card {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 15px;
    min-width: 120px;
    text-align: center;
    border: 1px solid #eee;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .stat-card h3 {
    font-size: 24px;
    margin: 0 0 5px;
    color: #2c3e50;
  }

  .stat-card p {
    margin: 0;
    color: #666;
  }

  .loading-indicator,
  .no-jobs {
    text-align: center;
    padding: 30px;
    color: #666;
    background: #f8f9fa;
    border-radius: 8px;
    margin-top: 20px;
  }

  .job-table-container {
    overflow-x: auto;
    border: 1px solid #eee;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .job-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
  }

  .job-table th,
  .job-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
  }

  .job-table th {
    background: #f5f5f5;
    font-weight: 600;
    color: #333;
  }

  .job-table tr:hover {
    background-color: #f8f9fa;
  }

  /* Resizable columns */
  .resizable-column {
    position: relative;
  }

  .resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 5px;
    height: 100%;
    cursor: col-resize;
    opacity: 0;
    background-color: #aaa;
  }

  .resizable-column:hover .resize-handle {
    opacity: 0.5;
  }

  body.resizing {
    cursor: col-resize !important;
    user-select: none;
  }

  body.resizing * {
    user-select: none !important;
  }

  /* Column selector modal */
  .column-selector-modal {
    max-width: 500px;
  }

  .column-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    margin-bottom: 20px;
  }

  .column-option {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .column-option input[type="checkbox"] {
    margin: 0;
  }

  .column-selector-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }

  .action-btn.primary {
    background-color: #2196f3;
    color: white;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.queued {
    background-color: #e3f2fd;
    color: #1976d2;
  }

  .status-badge.dequeued {
    background-color: #fff8e1;
    color: #ffa000;
  }

  .status-badge.complete {
    background-color: #e8f5e9;
    color: #388e3c;
  }

  .status-badge.failed {
    background-color: #ffebee;
    color: #d32f2f;
  }

  .status-badge.cancelled {
    background-color: #eeeeee;
    color: #616161;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    row-gap: 5px;
    justify-content: flex-start;
  }

  .action-btn {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .action-btn.retry {
    background-color: #2196f3;
    color: white;
  }

  .action-btn.remove {
    background-color: #f44336;
    color: white;
  }

  .action-btn.view {
    background-color: #4caf50;
    color: white;
  }

  .action-btn.params {
    background-color: #9c27b0;
    color: white;
  }

  .action-btn.result {
    background-color: #ff9800;
    color: white;
  }

  .action-btn:hover {
    opacity: 0.9;
  }

  /* Modal styles */
  .modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    max-width: 700px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid #eee;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: #666;
  }

  .modal-body {
    padding: 20px;
  }

  .detail-row {
    margin-bottom: 10px;
  }

  .detail-section {
    margin-top: 20px;
  }

  .detail-section h4 {
    margin-bottom: 10px;
    font-size: 16px;
    color: #333;
  }

  .detail-section pre {
    background: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    max-height: 200px;
  }

  .modal-actions {
    margin-top: 20px;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .refresh-interval-control {
    flex: 1;
    max-width: 300px;
    background: #f8f9fa;
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .slider-label {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
    min-width: 70px;
    width: 180px;
    max-width: 180px;
  }

  .refresh-slider {
    flex: 1;
    -webkit-appearance: none;
    height: 4px;
    background: #d7dcdf;
    border-radius: 2px;
    outline: none;

  }

  .refresh-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #2196F3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .refresh-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #2196F3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .refresh-slider::-ms-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #2196F3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  /* Sortable column styles */
  .sortable {
    cursor: pointer;
  }

  .sorted {
    background-color: #eaf6ff !important;
  }

  .sort-indicator {
    margin-left: 5px;
    font-size: 12px;
    color: #2196F3;
  }

  .column-header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 15px;
    /* Make room for the resize handle */
  }

  /* Add new style for clickable job names */
  .job-name-link {
    color: #2196f3;
    cursor: pointer;
    text-decoration: underline;
  }

  .job-name-link:hover {
    color: #0d47a1;
  }
</style>
