using System;

namespace WarningAsErrorExample
{
    class Program
    {
        [Obsolete("This method is deprecated.")]
        static void ObsoleteMethod()
        {
            Console.WriteLine("This method is obsolete.");
        }

        static void Main(string[] args)
        {
            // This will trigger warning CS0618
            ObsoleteMethod();
        }
    }
}
