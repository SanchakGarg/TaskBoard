export function TermsOfService() {
  return (
    <div className="graph-paper min-h-screen p-8 flex flex-col items-center">
      <div className="max-w-3xl w-full mb-4 flex justify-start">
        <a href="#/" className="text-pen-blue hover:underline font-hand text-lg">← Return to Home</a>
      </div>
      <div className="max-w-3xl w-full bg-paper p-8 rounded-xl shadow-sm border border-ink/10">
        <h1 className="text-3xl font-bold mb-6 font-hand">Terms of Service</h1>
        
        <p className="mb-4">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">1. Acceptance of Terms</h2>
          <p className="mb-4 leading-relaxed">
            By accessing or using Taskboard, you agree to be bound by these Terms of Service. If you do not agree to all of these terms, do not use the application.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">2. Description of Service</h2>
          <p className="mb-4 leading-relaxed">
            Taskboard is a task management application that allows users to organize tasks, collaborate with others, and synchronize data with Google Sheets.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">3. User Conduct</h2>
          <p className="mb-4 leading-relaxed">
            You agree to use Taskboard only for lawful purposes. You are responsible for all content you post and for ensuring that your use of the service does not violate any applicable laws or regulations.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">4. Intellectual Property</h2>
          <p className="mb-4 leading-relaxed">
            The application and its original content, features, and functionality are owned by the developer and are protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">5. Limitation of Liability</h2>
          <p className="mb-4 leading-relaxed">
            Taskboard is provided "as is" and "as available" without any warranties. In no event shall the developer be liable for any indirect, incidental, special, consequential, or punitive damages.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 font-hand">6. Changes to Terms</h2>
          <p className="mb-4 leading-relaxed">
            We reserve the right to modify these Terms of Service at any time. Your continued use of the service after such modifications constitutes your acceptance of the new terms.
          </p>
        </section>

        <div className="mt-8 pt-8 border-t border-ink/10 text-center flex flex-wrap justify-center items-center gap-4 text-sm text-ink-soft">
          <a href="#/about" className="text-pen-blue hover:underline font-hand text-lg">About</a>
          <span>•</span>
          <a href="#/privacy" className="text-pen-blue hover:underline font-hand text-lg">Privacy Policy</a>
          <span>•</span>
          <a href="#/" className="text-pen-blue hover:underline font-hand text-lg">Return to Home</a>
        </div>
      </div>
    </div>
  );
}
