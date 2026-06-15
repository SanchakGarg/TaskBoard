export function PrivacyPolicy() {
  return (
    <div className="graph-paper min-h-screen p-8 flex justify-center">
      <div className="max-w-3xl w-full bg-paper p-8 rounded-xl shadow-sm border border-ink/10">
        <h1 className="text-3xl font-bold mb-6 font-hand">Privacy Policy</h1>
        
        <p className="mb-4">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">1. Information We Collect</h2>
          <p className="mb-2">We collect the following information when you use Taskboard:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Google Profile Data:</strong> If you log in via Google, we access your name, email address, and profile picture to create your account and identify you within the app.</li>
            <li><strong>Task and Project Data:</strong> Data you input into Taskboard, such as task titles, descriptions, due dates, and project structures.</li>
            <li><strong>Google Sheets Data:</strong> If you explicitly link a project or workspace to Google Sheets, we request the <code>https://www.googleapis.com/auth/spreadsheets</code> scope to read and write to the specific spreadsheets you authorize, enabling two-way synchronization.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">2. How We Use Your Information</h2>
          <p className="mb-2">Your information is used strictly to provide the core functionality of Taskboard:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>To display your profile and manage task assignments.</li>
            <li>To synchronize your tasks with your Google Sheets if you have enabled the integration.</li>
            <li>We do <strong>not</strong> use your data to serve personalized ads, retargeting, or interest-based advertising.</li>
            <li>We do <strong>not</strong> sell or transfer your data to any third-party data brokers or resellers.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">3. Google Limited Use Policy</h2>
          <p className="mb-4">
            Taskboard's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-pen-blue underline" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.
          </p>
          <p className="mb-4">
            Specifically, we only use the data obtained through Google APIs to provide or improve user-facing features that are prominent in the requesting app's user interface. Human access to your Google data is strictly prohibited unless you provide affirmative agreement, or it is necessary for security purposes, or to comply with applicable laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">4. Data Storage and Security</h2>
          <p className="mb-4">
            We store your data securely in our PostgreSQL database. Authentication tokens (like Google refresh tokens) are stored securely and are only used programmatically by our servers to perform authorized background synchronizations (such as updating your Google Sheets).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">5. Your Controls and Choices</h2>
          <p className="mb-4">
            You can revoke Taskboard's access to your Google account at any time by visiting your Google Account settings page. If you delete your Taskboard account, all associated data and synchronization tokens will be permanently deleted from our servers.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">6. Contact Us</h2>
          <p className="mb-4">
            If you have any questions about this Privacy Policy, please contact the developer via the official repository or support email.
          </p>
        </section>

        <div className="mt-8 pt-8 border-t border-ink/10 text-center flex flex-wrap justify-center gap-6">
          <a href="#/about" className="text-pen-blue hover:underline font-hand text-lg">About</a>
          <a href="#/" className="text-pen-blue hover:underline font-hand text-lg">Return to Home</a>
        </div>
      </div>
    </div>
  );
}
