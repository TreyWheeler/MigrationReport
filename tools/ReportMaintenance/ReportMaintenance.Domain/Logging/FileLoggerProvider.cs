using System.Collections.Concurrent;
using System.IO;
using Microsoft.Extensions.Logging;

namespace ReportMaintenance.Logging;

internal sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly StreamWriter _writer;
    private readonly object _lock = new();
    private readonly ConcurrentDictionary<string, FileLogger> _loggers = new(StringComparer.OrdinalIgnoreCase);

    public FileLoggerProvider(string? logsDirectory)
    {
        var resolvedDirectory = string.IsNullOrWhiteSpace(logsDirectory) ? "logs" : logsDirectory;
        var fullDirectory = Path.GetFullPath(resolvedDirectory, Directory.GetCurrentDirectory());
        Directory.CreateDirectory(fullDirectory);

        var fileName = $"report-maintenance_{DateTimeOffset.UtcNow:yyyyMMdd}.log";
        var filePath = Path.Combine(fullDirectory, fileName);

        var stream = new FileStream(filePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
        _writer = new StreamWriter(stream)
        {
            AutoFlush = true
        };
    }

    public ILogger CreateLogger(string categoryName)
    {
        return _loggers.GetOrAdd(categoryName, name => new FileLogger(name, _writer, _lock));
    }

    public void Dispose()
    {
        _writer.Dispose();
    }

    private sealed class FileLogger : ILogger
    {
        private readonly string _categoryName;
        private readonly TextWriter _writer;
        private readonly object _lock;

        public FileLogger(string categoryName, TextWriter writer, object syncLock)
        {
            _categoryName = categoryName;
            _writer = writer;
            _lock = syncLock;
        }

        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NoopScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var message = formatter?.Invoke(state, exception);
            if (string.IsNullOrWhiteSpace(message) && exception is null)
            {
                return;
            }

            var timestamp = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz");
            var line = $"{timestamp} [{logLevel}] {_categoryName}: {message}".TrimEnd();

            lock (_lock)
            {
                _writer.WriteLine(line);
                if (exception is not null)
                {
                    _writer.WriteLine(exception);
                }
            }
        }
    }
    private sealed class NoopScope : IDisposable
    {
        public static readonly NoopScope Instance = new();

        public void Dispose()
        {
        }
    }
}
