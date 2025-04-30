
// Define the URL and the data payload
const url = 'https://8888-01js1h540pyys2dz7kcae1fbk9.cloudspaces.litng.ai/ask';
const data = {
    query: "What is the main topic of the ingested documents?",
    session_id: "user123_chat789"
};

// Define an async function to make the request
async function postData() {
    try {
        const response = await fetch(url, {
            method: 'POST', // Corresponds to -X POST
            headers: {
                'Content-Type': 'application/json' // Corresponds to -H "Content-Type: application/json"
            },
            body: JSON.stringify(data) // Corresponds to -d '{...}', converting JS object to JSON string
        });

        // Check if the request was successful (status code 2xx)
        if (!response.ok) {
            // If not successful, throw an error with status information
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
        }

        // Parse the JSON response body
        const responseData = await response.json();

        // Log the response data from the server
        console.log('Success:', responseData);
        return responseData; // Optionally return the data

    } catch (error) {
        // Log any errors that occurred during the fetch
        console.error('Error making POST request:', error);
    }
}

// Call the function to execute the request
postData();
